import { Coordinate } from './coordinate.model';
import { Direction } from './direction.enum';
export interface Coordinate {
  x: number;
  y: number;
}

export const CoordinateUtils = {
  neighbors: (coord: Coordinate) => [
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y },
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x, y: coord.y + 1 }
  ],
  distance: (a: Coordinate, b: Coordinate) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  isSame: (a: Coordinate, b: Coordinate) => a.x === b.x && a.y === b.y,
  isInNodes: (nodes: Coordinate[], node: Coordinate, tailTrim?: number) => {
    tailTrim = tailTrim > 0 ? tailTrim : 0;
    for (let i = 0; i < (nodes.length - tailTrim); i++) {
      if (CoordinateUtils.isSame(node, nodes[i])) return true;
    }
    return false;
  },
  direction: (fromNode: Coordinate, toNode: Coordinate) => {
    if (fromNode.y > toNode.y) return Direction.UP;
    if (fromNode.y < toNode.y) return Direction.DOWN;
    if (fromNode.x > toNode.x) return Direction.LEFT;
    if (fromNode.x < toNode.x) return Direction.RIGHT;
    return "";
  },
  getHash: (node: Coordinate) => `${node.x},${node.y}`
};
