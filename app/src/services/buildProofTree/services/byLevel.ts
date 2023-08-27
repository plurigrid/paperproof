import { UIHypTree, UIElement } from 'types';

import hStack from './hStack';
import vStack from './vStack';

const byLevel = (hMargin: number, trees: UIHypTree[]) : UIElement[][] => {
  const rows: UIElement[][] = [];
  function visit(t: UIHypTree) {
    while (rows.length <= t.level) {
      rows.push([]);
    }
    rows[t.level].push(vStack(0, [t.tactic, hStack(hMargin, t.nodes.map(n => n.node))]));
    for (const n of t.nodes) {
      if (n.tree) {
        visit(n.tree);
      }
    }
  }
  trees.forEach(visit);
  return rows;
}

export default byLevel;
