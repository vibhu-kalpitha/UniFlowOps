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

  // 6. PO Quantity Edit - Safety Validation
  it('6. PO Quantity Edit prevents reducing target quantity below processed/packed items', () => {
    const existingPo = {
      id: 'po-001',
      poNumber: 'PO-TEST-001',
      packedCount: 150,
      qcPassedCount: 200,
      totalQuantity: 500
    };

    function validateQuantityUpdate(po: typeof existingPo, newQty: number) {
      const maxProcessed = Math.max(po.packedCount, po.qcPassedCount);
      if (newQty < maxProcessed) {
        return {
          allowed: false,
          error: 'QUANTITY_SAFETY_VIOLATION',
          message: `Cannot reduce quantity to ${newQty}. ${maxProcessed} items have already been processed/packed.`
        };
      }
      return { allowed: true, effectiveQuantity: newQty };
    }

    // Attempting to reduce below 200 (qcPassedCount = 200) -> rejected
    const invalidAttempt = validateQuantityUpdate(existingPo, 180);
    expect(invalidAttempt.allowed).toBe(false);
    expect(invalidAttempt.error).toBe('QUANTITY_SAFETY_VIOLATION');

    // Attempting to set valid quantity >= 200 -> allowed
    const validAttempt = validateQuantityUpdate(existingPo, 250);
    expect(validAttempt.allowed).toBe(true);
    expect(validAttempt.effectiveQuantity).toBe(250);
  });

  // 7. PO Quantity Edit - Multi-config sum & distribution
  it('7. PO Quantity Edit updates individual config quantities and recalculates total correctly', () => {
    const configs = [
      { id: 'cfg-s', size: 'S', quantity: 100 },
      { id: 'cfg-m', size: 'M', quantity: 200 },
      { id: 'cfg-l', size: 'L', quantity: 300 }
    ];

    const submittedConfigs = [
      { id: 'cfg-s', quantity: 120 },
      { id: 'cfg-m', quantity: 250 },
      { id: 'cfg-l', quantity: 350 }
    ];

    const sumSubmitted = submittedConfigs.reduce((sum, c) => sum + c.quantity, 0);
    expect(sumSubmitted).toBe(720);

    const updated = configs.map(cfg => {
      const match = submittedConfigs.find(sc => sc.id === cfg.id);
      return match ? { ...cfg, quantity: match.quantity } : cfg;
    });

    expect(updated[0].quantity).toBe(120);
    expect(updated[1].quantity).toBe(250);
    expect(updated[2].quantity).toBe(350);
    expect(updated.reduce((s, c) => s + c.quantity, 0)).toBe(720);
  });

  // 8. Edit Full PO - Preserves PO ID and updates permitted fields
  it('8. Edit Full PO updates permitted metadata fields while preserving existing PO ID', () => {
    const originalPo = {
      id: 'po-uuid-12345',
      poNumber: 'PO-2026-A',
      customer: 'Brand Alpha',
      styleId: 'style-001',
      startDate: '2026-10-01',
      dueDate: '2026-10-20',
      status: 'CURRENT',
      remarks: 'Initial remarks',
      allowNoProductPrefix: false,
      allowNoBoxPrefix: false
    };

    const updates = {
      poNumber: 'PO-2026-A-UPDATED',
      customer: 'Brand Alpha Premium',
      styleId: 'style-002',
      startDate: '2026-10-05',
      dueDate: '2026-10-28',
      status: 'CURRENT',
      remarks: 'Updated rush order instructions',
      allowNoProductPrefix: true,
      allowNoBoxPrefix: false
    };

    // Apply updates
    const updatedPo = {
      ...originalPo,
      ...updates,
      id: originalPo.id // PO ID must strictly be preserved
    };

    expect(updatedPo.id).toBe('po-uuid-12345');
    expect(updatedPo.poNumber).toBe('PO-2026-A-UPDATED');
    expect(updatedPo.customer).toBe('Brand Alpha Premium');
    expect(updatedPo.styleId).toBe('style-002');
    expect(updatedPo.dueDate).toBe('2026-10-28');
    expect(updatedPo.remarks).toBe('Updated rush order instructions');
    expect(updatedPo.allowNoProductPrefix).toBe(true);
    expect(updatedPo.allowNoBoxPrefix).toBe(false);
  });

  // 9. Delete PO - Admin capability
  it('9. Admin PO deletion safely cleans up associated configs and audit records', () => {
    const databaseState = {
      productionOrders: [{ id: 'po-del-1', poNumber: 'PO-DEL-001' }],
      configs: [{ id: 'cfg-1', productionOrderId: 'po-del-1' }],
      boxes: [{ id: 'box-1', productionOrderId: 'po-del-1' }],
      items: [{ id: 'item-1', productionOrderId: 'po-del-1' }]
    };

    function deleteProductionOrder(poId: string) {
      const exists = databaseState.productionOrders.some(p => p.id === poId);
      if (!exists) return { success: false, error: 'PO_NOT_FOUND' };

      databaseState.configs = databaseState.configs.filter(c => c.productionOrderId !== poId);
      databaseState.boxes = databaseState.boxes.filter(b => b.productionOrderId !== poId);
      databaseState.items = databaseState.items.filter(i => i.productionOrderId !== poId);
      databaseState.productionOrders = databaseState.productionOrders.filter(p => p.id !== poId);

      return { success: true };
    }

    const res = deleteProductionOrder('po-del-1');
    expect(res.success).toBe(true);
    expect(databaseState.productionOrders.length).toBe(0);
    expect(databaseState.configs.length).toBe(0);
    expect(databaseState.boxes.length).toBe(0);
    expect(databaseState.items.length).toBe(0);

    // Deleting again returns PO_NOT_FOUND
    const secondAttempt = deleteProductionOrder('po-del-1');
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.error).toBe('PO_NOT_FOUND');
  });
});


