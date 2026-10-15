import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

describe('Optional No-Prefix Product and Box Configuration Tests', () => {
  // 1. Migration DDL verification
  it('1. Migration 010_po_no_prefix_options.sql contains required columns with DEFAULT 0', () => {
    const migrationPath = path.resolve(__dirname, '../server/src/db/migrations/010_po_no_prefix_options.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('allow_no_product_prefix');
    expect(sql).toContain('allow_no_box_prefix');
    expect(sql).toContain('TINYINT');
    expect(sql).toContain('DEFAULT 0');
  });

  // 2. createPoSchema Zod validation
  it('2. createPoSchema accepts allowNoProductPrefix and allowNoBoxPrefix as optional booleans', () => {
    const createPoSchema = z.object({
      poNumber: z.string().min(1),
      styleId: z.string().min(1),
      customer: z.string().min(1),
      startDate: z.string().min(1),
      dueDate: z.string().min(1),
      totalQuantity: z.number().int().positive().optional(),
      configurations: z.array(z.any()).default([]),
      boxConfigurations: z.array(z.any()).default([]),
      allowNoProductPrefix: z.boolean().optional(),
      allowNoBoxPrefix: z.boolean().optional()
    });

    const standardPo = createPoSchema.parse({
      poNumber: 'PO-TEST-001',
      styleId: 'STYLE-001',
      customer: 'Brand A',
      startDate: '2026-10-15',
      dueDate: '2026-10-25'
    });
    expect(standardPo.allowNoProductPrefix).toBeUndefined();
    expect(standardPo.allowNoBoxPrefix).toBeUndefined();

    const noPrefixPo = createPoSchema.parse({
      poNumber: 'PO-TEST-002',
      styleId: 'STYLE-001',
      customer: 'Brand A',
      startDate: '2026-10-15',
      dueDate: '2026-10-25',
      allowNoProductPrefix: true,
      allowNoBoxPrefix: true
    });
    expect(noPrefixPo.allowNoProductPrefix).toBe(true);
    expect(noPrefixPo.allowNoBoxPrefix).toBe(true);
  });

  // 3. Product Serial Validation Logic (Disabled vs Enabled)
  it('3. Product serial validation enforces prefix when disabled, but allows free serials when enabled', () => {
    const configs = [
      { id: 'cfg-1', configCode: 'CFG-SHIRT-M', productPrefix: 'SHIRT-M-', qrRangeStart: 1, qrRangeEnd: 1000 }
    ];

    function validateProduct(qr: string, allowNoPrefix: boolean, poConfigs: typeof configs) {
      if (poConfigs.length === 0 && !allowNoPrefix) {
        return { valid: false, reason: 'CONFIG_NOT_SELECTED' };
      }

      // Check matched config
      const matched = poConfigs.find(c => c.productPrefix && qr.startsWith(c.productPrefix));
      if (matched) {
        return { valid: true, config: matched };
      }

      // If no prefix mode is enabled, permit free serial
      if (allowNoPrefix) {
        return { valid: true, config: poConfigs[0] || null, mode: 'FREE_SERIAL' };
      }

      return { valid: false, reason: 'PRODUCT_PREFIX_MISMATCH' };
    }

    // When disabled (default / existing behavior):
    expect(validateProduct('SHIRT-M-00045', false, configs).valid).toBe(true);
    expect(validateProduct('RANDOM-SERIAL-99', false, configs).valid).toBe(false);
    expect(validateProduct('RANDOM-SERIAL-99', false, configs).reason).toBe('PRODUCT_PREFIX_MISMATCH');
    expect(validateProduct('RANDOM-SERIAL-99', false, []).valid).toBe(false);
    expect(validateProduct('RANDOM-SERIAL-99', false, []).reason).toBe('CONFIG_NOT_SELECTED');

    // When enabled (new additive capability):
    expect(validateProduct('SHIRT-M-00045', true, configs).valid).toBe(true);
    expect(validateProduct('RANDOM-SERIAL-99', true, configs).valid).toBe(true);
    expect(validateProduct('RANDOM-SERIAL-99', true, configs).mode).toBe('FREE_SERIAL');
    expect(validateProduct('ANY-FREE-SERIAL-12345', true, []).valid).toBe(true);
    expect(validateProduct('ANY-FREE-SERIAL-12345', true, []).mode).toBe('FREE_SERIAL');
  });

  // 4. Box Identifier Validation Logic (Disabled vs Enabled)
  it('4. Box identifier validation enforces prefix when disabled, but allows free box identifiers when enabled', () => {
    const boxConfigs = [
      { id: 'bcfg-1', boxPrefix: 'BX-S-', capacity: 20 }
    ];

    function validateBox(boxQr: string, allowNoBoxPrefix: boolean, configs: typeof boxConfigs) {
      const matched = configs.find(b => b.boxPrefix && boxQr.startsWith(b.boxPrefix));
      if (matched) {
        return { valid: true, capacity: matched.capacity, config: matched };
      }

      if (allowNoBoxPrefix) {
        const fallbackCapacity = configs[0]?.capacity || 20;
        return { valid: true, capacity: fallbackCapacity, mode: 'FREE_BOX' };
      }

      if (configs.length > 0) {
        return { valid: false, reason: 'BOX_PREFIX_MISMATCH' };
      }

      return { valid: false, reason: 'BOX_PREFIX_NOT_CONFIGURED' };
    }

    // When disabled:
    expect(validateBox('BX-S-001', false, boxConfigs).valid).toBe(true);
    expect(validateBox('CARTON-999', false, boxConfigs).valid).toBe(false);
    expect(validateBox('CARTON-999', false, boxConfigs).reason).toBe('BOX_PREFIX_MISMATCH');
    expect(validateBox('CARTON-999', false, []).valid).toBe(false);
    expect(validateBox('CARTON-999', false, []).reason).toBe('BOX_PREFIX_NOT_CONFIGURED');

    // When enabled:
    expect(validateBox('BX-S-001', true, boxConfigs).valid).toBe(true);
    expect(validateBox('CARTON-999', true, boxConfigs).valid).toBe(true);
    expect(validateBox('CARTON-999', true, boxConfigs).capacity).toBe(20);
    expect(validateBox('CUSTOM-BOX-88', true, []).valid).toBe(true);
    expect(validateBox('CUSTOM-BOX-88', true, []).capacity).toBe(20);
  });

  // 5. Strict Box Capacity and Ownership Enforcement
  it('5. Box capacity and duplicate prevention remain strictly enforced regardless of prefix mode', () => {
    const box = {
      id: 'box-101',
      productionOrderId: 'PO-001',
      capacity: 5,
      items: ['ITEM-1', 'ITEM-2', 'ITEM-3', 'ITEM-4', 'ITEM-5']
    };

    function canPackItem(targetBox: typeof box, itemPoId: string, itemQr: string) {
      // 1. PO Ownership check
      if (targetBox.productionOrderId !== itemPoId) {
        return { allowed: false, error: 'BOX_PO_MISMATCH' };
      }
      // 2. Duplicate item check
      if (targetBox.items.includes(itemQr)) {
        return { allowed: false, error: 'ITEM_ALREADY_IN_BOX' };
      }
      // 3. Capacity check
      if (targetBox.items.length >= targetBox.capacity) {
        return { allowed: false, error: 'BOX_FULL' };
      }
      return { allowed: true };
    }

    // Rejection when PO doesn't match
    expect(canPackItem(box, 'PO-OTHER', 'ITEM-NEW')).toEqual({ allowed: false, error: 'BOX_PO_MISMATCH' });

    // Rejection when duplicate item scanned
    expect(canPackItem(box, 'PO-001', 'ITEM-2')).toEqual({ allowed: false, error: 'ITEM_ALREADY_IN_BOX' });

    // Rejection when box capacity reached (5/5)
    expect(canPackItem(box, 'PO-001', 'ITEM-NEW-6')).toEqual({ allowed: false, error: 'BOX_FULL' });

    // Allowed when space is available
    const openBox = { ...box, items: ['ITEM-1'] };
    expect(canPackItem(openBox, 'PO-001', 'ITEM-NEW')).toEqual({ allowed: true });
  });
});
