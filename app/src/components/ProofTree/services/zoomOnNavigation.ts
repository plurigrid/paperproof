import { ConvertedProofTree, Box } from 'types';
import { getDisplayedId } from 'src/services/converter';
import zoomToBox from './zoomToBox';

const getParentBoxId = (boxes: Box[], childId: string): string | null => {
  const childWindow = boxes.find((w) => w.id === childId);
  const parentId = childWindow!.parentId;
  return parentId;
}

const findLcm = (boxes: Box[], windowIdA: string, windowIdB: string): string => {
  const parentsOfA: (string | null)[] = [];
  let idA: string | null = windowIdA;
  while (true) {
    parentsOfA.push(idA);
    if (idA === null) { break; }
    idA = getParentBoxId(boxes, idA);
  }

  let idB: string | null = windowIdB;
  while (true) {
    // Shouldn't ever happen, it's only here to calm typescript
    if (idB === null) { return windowIdB; }
    // We found our lowest shared parent!
    if (parentsOfA.includes(idB)) {
      return idB;
    }
    idB = getParentBoxId(boxes, idB);
  }
}

const zoomOnNavigation = (convertedTree: ConvertedProofTree, goalId: string | undefined) => {
  // 1. If there is no interactive goal, then we're on the last line, so rezoom on root.
  // 2. If the user never clicked on any window - then rezoom on root.
  const lastClickedOnBoxId = localStorage.getItem('zoomedBoxId');
  const lastClickedOnBox = lastClickedOnBoxId && document.getElementById(`box-${lastClickedOnBoxId}`);
  if (!goalId || !lastClickedOnBox) {
    const rootBox = document.getElementById("box-1");
    if (rootBox) { zoomToBox(rootBox); }
    return;
  }

  // 3. Rezoom on the common ancestor of (boxWithCurrentGoal, lastClickedOnBoxId)
  const boxWithCurrentGoal = convertedTree.boxes.find((w) =>
    w.goalNodes.find((g) => g.id === getDisplayedId(convertedTree, goalId))
  );
  if (!boxWithCurrentGoal) {
    console.error(`We tried to zoom in, but couldn't find the window with the goal ${goalId}. This probably shouldn't happen, check what went wrong.`);
    return;
  }

  let lcmBoxId = findLcm(convertedTree.boxes, boxWithCurrentGoal.id, lastClickedOnBoxId);
  const lcmBox = document.getElementById(`box-${lcmBoxId}`);

  if (lcmBox) {
    zoomToBox(lcmBox);
  }
}

export default zoomOnNavigation;
