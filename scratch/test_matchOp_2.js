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

const assignedOps = [
  'PRE_QC', 'QC_TEST', 'PACKING', 'AQL', 'FINAL_AQL', 'BOX_TRANSFER',
  'Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'FINAL AQL', 'Box Transfer',
  'Pre-QC', 'QC-Test', 'QC', 'Final AQL', 'Normal AQL', 'QC_AND_TEST'
];
const targetOps = ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'FINAL_AQL', 'Box Transfer', 'AQL'];

for (const target of targetOps) {
  for (const assigned of assignedOps) {
    const match = matchOp(assigned, target);
    // Print ONLY false negatives (where they intuitively SHOULD match but return false)
    if (!match) {
       // logic to detect false negatives?
       // Just print them all so I can inspect manually.
    }
  }
}

// Check specific intuitively matching pairs:
const pairs = [
  ['Pre-QC', 'Pre QC'],
  ['QC-Test', 'QC Test'],
  ['QC', 'QC Test'],
  ['QC_AND_TEST', 'QC Test'],
  ['AQL Checker', 'AQL'],
  ['Normal AQL', 'AQL'],
  ['FINAL AQL', 'FINAL_AQL'],
  ['Box Transfer', 'BOX_TRANSFER']
];

for (const [a, t] of pairs) {
  console.log(`Assigned: '${a}', Target: '${t}' -> Match: ${matchOp(a, t)}`);
}
