import { Coordinate } from './../models/coordinate.model';
// var assert = require('assert')
//   , StringSet = require('Set')
//   , Heap = require('heap')
//   , dict = require('dict')
import * as assert from 'assert';
import * as Collections from 'typescript-collections';

export enum AStarStatus {
  success = "success",
  timeout = "timeout",
  noPath = "noPath"
}

export enum ResultGoal {
  food = "food",
  tail = "tail"
}

export interface AStarResult {
  status: AStarStatus;
  cost: number;
  path: Coordinate[];
  goal?: ResultGoal;
  extendPath?: string;
}

export const aStar = (params): AStarResult => {
  assert.ok(params.start !== undefined);
  assert.ok(params.isEnd !== undefined);
  assert.ok(params.neighbor);
  assert.ok(params.distance);
  assert.ok(params.heuristic);
  if (params.timeout === undefined) { params.timeout = Infinity; }
  assert.ok(!isNaN(params.timeout));
  const hash = params.hash || defaultHash;

  const startNode = {
    data: params.start,
    g: 0,
    h: params.heuristic(params.start),
  } as any;
  let bestNode = startNode;
  startNode.f = startNode.h;
  // leave .parent undefined
  const closedDataSet = new Set();
  const openHeap = new Collections.Heap(heapComparator);
  const openDataMap = new Collections.Dictionary();
  openHeap.add(startNode);
  openDataMap[hash(startNode.data)] = startNode;
  const startTime = new Date().getMilliseconds();
  while (openHeap.size()) {
    if ((new Date()).getMilliseconds() - startTime > params.timeout) {
      return {
        status: AStarStatus.timeout,
        cost: bestNode.f,
        path: reconstructPath(bestNode),
      };
    }
    const node = openHeap.removeRoot();
    openDataMap.remove(hash(node.data));
    if (params.isEnd(node.data)) {
      // done
      return {
        status: AStarStatus.success,
        cost: node.f,
        path: reconstructPath(node),
      };
    }
    // not done yet
    closedDataSet.add(hash(node.data));
    const neighbors = params.neighbor(node.data, reconstructPath(node));
    for (let i = 0; i < neighbors.length; i++) {
      const neighborData = neighbors[i];
      if (closedDataSet.has(hash(neighborData))) {
        // skip closed neighbors
        continue;
      }
      const gFromThisNode = node.g + params.distance(node.data, neighborData);
      const hFromThisNode = node.h + params.heuristic(node.data);
      let neighborNode = openDataMap[hash(neighborData)];
      let update = false;
      if (neighborNode === undefined) {
        // add neighbor to the open set
        neighborNode = {
          data: neighborData,
        };
        // other properties will be set later
        openDataMap[hash(neighborData)] = neighborNode;
      } else {
        if (neighborNode.g + neighborNode.h < gFromThisNode + hFromThisNode) {
          // skip this one because another route is faster
          continue;
        }
        update = true;
      }
      // found a new or better route.
      // update this neighbor with this node as its new parent
      neighborNode.parent = node;
      neighborNode.g = gFromThisNode;
      neighborNode.h = hFromThisNode;
      neighborNode.f = gFromThisNode + hFromThisNode;
      //      console.log('current: ' + neighborNode.f, 'best: ' + bestNode.f);
      if (neighborNode.f < bestNode.f) {
        bestNode = neighborNode;
      }
      if (update) {
        // openHeap.();
      } else {
        openHeap.add(neighborNode);
      }
    }
  }
  // all the neighbors of every accessible node have been exhausted
  return {
    status: AStarStatus.noPath,
    cost: bestNode.f,
    path: reconstructPath(bestNode),
  };
};

function reconstructPath(node) {
  if (node.parent !== undefined) {
    const pathSoFar = reconstructPath(node.parent);
    pathSoFar.push(node.data);
    return pathSoFar;
  } else {
    // this is the starting node
    return [node.data];
  }
}

function defaultHash(node) {
  return node.toString();
}

function heapComparator(a, b) {
  return a.f - b.f;
}
