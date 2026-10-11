const matchOp = (assignedOp, targetOp) => {
  if (!assignedOp || assignedOp.toUpperCase() === 'ALL') return true;
  const a = assignedOp.toUpperCase().replace(/[^A-Z]/g, '');
  const t = targetOp.toUpperCase().replace(/[^A-Z]/g, '');
  if (a === t) return true;
  if (a.includes('PRE') || t.includes('PRE')) return a.includes('PRE') && t.includes('PRE');
  if (t.includes('FINAL') || a.includes('FINAL')) {
    return t.includes('FINAL') && a.includes('FINAL');
  }
  if (a.includes('AQL') && t.includes('AQL')) {
    return !a.includes('FINAL') && !t.includes('FINAL');
  }
  if (a.includes('QC') && t.includes('QC')) return true;
  if (a.includes('PACK') && t.includes('PACK')) return true;
  if (a.includes('TRANSFER') && t.includes('TRANSFER')) return true;
  return false;
};

const assignedOps = ['PRE_QC', 'QC_TEST', 'PACKING', 'AQL', 'FINAL_AQL', 'BOX_TRANSFER'];
const targetOps = ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'FINAL_AQL', 'Box Transfer', 'AQL'];

for (const target of targetOps) {
  console.log(`\nTarget: ${target}`);
  for (const assigned of assignedOps) {
    console.log(`  Assigned: ${assigned.padEnd(15)} -> Match: ${matchOp(assigned, target)}`);
  }
}
