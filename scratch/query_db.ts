import { db, ensureDbConnected } from '../server/src/db/connection';

async function main() {
  await ensureDbConnected();

  console.log("=== PRODUCTION ORDERS ===");
  const pos = db.prepare("SELECT * FROM production_orders WHERE po_number LIKE '%7777%' OR po_number LIKE '%77293%'").all();
  console.log(JSON.stringify(pos, null, 2));

  console.log("\n=== ALL RECENT PRODUCTION ORDERS ===");
  const allPos = db.prepare("SELECT id, po_number, customer, status, created_at FROM production_orders ORDER BY created_at DESC LIMIT 5").all();
  console.log(JSON.stringify(allPos, null, 2));

  console.log("\n=== SALES ORDERS ===");
  const sos = db.prepare("SELECT * FROM sales_orders WHERE so_number LIKE '%77293%' OR so_number LIKE '%7777%'").all();
  console.log(JSON.stringify(sos, null, 2));

  console.log("\n=== ALL RECENT SALES ORDERS ===");
  const allSos = db.prepare("SELECT id, production_order_id, so_number, product, style_code, colour, order_quantity, status FROM sales_orders ORDER BY created_at DESC LIMIT 5").all();
  console.log(JSON.stringify(allSos, null, 2));

  // Also query if any SO matches
  const targetSos = sos.length > 0 ? sos : allSos;
  for (const so of targetSos as any[]) {
    const soId = so.id;
    console.log(`\n==================================================`);
    console.log(`DETAILS FOR SALES ORDER: ${so.so_number} (ID: ${so.id})`);
    console.log(`==================================================`);

    console.log(`\n--- ITEM UNITS FOR SO ${so.so_number} ---`);
    const items = db.prepare("SELECT id, qr_code, size, status, created_at, updated_at FROM item_units WHERE sales_order_id = ?").all(soId);
    console.log(`Total item units: ${items.length}`);
    console.log(JSON.stringify(items, null, 2));

    console.log(`\n--- QC RESULTS FOR SO ${so.so_number} ITEMS ---`);
    const qcResults = db.prepare(`
      SELECT q.*, i.qr_code, i.size, u.username as operator_name 
      FROM qc_results q 
      JOIN item_units i ON q.item_id = i.id 
      LEFT JOIN users u ON q.operator_id = u.id
      WHERE i.sales_order_id = ?
    `).all(soId);
    console.log(`Total QC results: ${qcResults.length}`);
    console.log(JSON.stringify(qcResults, null, 2));

    console.log(`\n--- BOXES FOR SO ${so.so_number} ---`);
    const boxes = db.prepare("SELECT * FROM boxes WHERE sales_order_id = ?").all(soId);
    console.log(`Total boxes: ${boxes.length}`);
    console.log(JSON.stringify(boxes, null, 2));

    for (const box of boxes as any[]) {
      console.log(`\n--- BOX ITEMS FOR BOX ${box.box_number} (Status: ${box.status}, Cap: ${box.capacity}) ---`);
      const boxItems = db.prepare(`
        SELECT bi.*, i.qr_code, i.size, i.status as item_status, u.username as packed_by_username
        FROM box_items bi
        JOIN item_units i ON bi.item_id = i.id
        LEFT JOIN users u ON bi.packed_by = u.id
        WHERE bi.box_id = ?
      `).all(box.id);
      console.log(`Items inside box ${box.box_number}: ${boxItems.length}`);
      console.log(JSON.stringify(boxItems, null, 2));

      console.log(`--- AQL INSPECTIONS FOR BOX ${box.box_number} ---`);
      const aql = db.prepare("SELECT * FROM aql_inspections WHERE box_id = ?").all(box.id);
      console.log(JSON.stringify(aql, null, 2));

      for (const insp of aql as any[]) {
        console.log(`--- AQL SAMPLES FOR INSPECTION ${insp.id} ---`);
        const samples = db.prepare(`
          SELECT s.*, i.qr_code, i.size 
          FROM aql_samples s
          JOIN item_units i ON s.item_id = i.id
          WHERE s.inspection_id = ?
        `).all(insp.id);
        console.log(JSON.stringify(samples, null, 2));
      }
    }
  }
}

main().catch(console.error);
