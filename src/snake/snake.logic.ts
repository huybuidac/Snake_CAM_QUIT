import { MapInfo } from './../models/map.model';
import { AStarResult, AStarStatus, ResultGoal } from './../app/a-star';
import { Direction } from './../models/direction.enum';
import { Coordinate, CoordinateUtils } from './../models/coordinate.model';
import { RoomInfor, RoomUtils } from '../models/roomInfo.model';
import { SocketService } from '../app/socket.service';
import * as _ from 'lodash';
import { aStar } from '../app/a-star';
import { Player, PlayerUtils } from '../models/player.model';
import { environment } from '../environments/environment';
import { MapUtils } from '../models/map.model';
import { Dictionary } from 'typescript-collections';
import { FoodUtils } from '../models/food.model';

const SEARCH_TIMEOUT = 50;
const COST_HEAVY = 1000;
const COST_MODERATE = 250;
const COST_LIGHT = 100;

export class SnakeLogic {

  private _server: SocketService;

  constructor(server: SocketService) {
    this._server = server;
  }

  getFoodTravelNo(speed: number) {
    let result;
    if (speed <= 6) {
      result = 5;
    } else if (speed <= 10) {
      result = 4;
    } else if (speed <= 15) {
      result = 3;
    } else {
      result = 2;
    }
    return 3;
  }

  updateRoom(roomInfor: RoomInfor) {
    // console.time("snake");

    // RoomUtils.normalize(roomInfor);
    const ourHead = roomInfor.ourPlayer.head;
    const ourTail = roomInfor.ourPlayer.tail;

    // const spaceVals = this.getSpaceSize(roomInfor, ourHead);
    // this.calculateLongestPath(roomInfor, ourHead, spaceVals.path);
    // return;
    // 1. Sort Food by our head
    FoodUtils.calculateValues(roomInfor.foods);
    // const validfoods = [];
    // const neearWallfoods = [];
    // roomInfor.foods.forEach(t => {
    //   if (!MapUtils.isNearWall(roomInfor.map, t.coordinate)) {
    //     validfoods.push(t);
    //   } else {
    //     neearWallfoods.push(t);
    //   }
    // });
    // FoodUtils.sort(validfoods, ourHead);
    // FoodUtils.sort(neearWallfoods, ourHead);
    // roomInfor.foods = validfoods.concat(neearWallfoods);
    FoodUtils.sort(roomInfor.foods, ourHead);
    const results: AStarResult[] = [];

    const tailTargets = this.goodNeighbors(roomInfor, ourTail);
    if (!PlayerUtils.isGrowing(roomInfor.ourPlayer)) tailTargets.push(ourTail);
    for (let i = 0; i < tailTargets.length; i++) {
      const result = this.aStarSearch(roomInfor, ourHead, [tailTargets[i]]);
      if (result.status !== AStarStatus.success) continue;
      if (result.path.length === 0) continue;
      result.goal = ResultGoal.tail;


      const neighbors = this.goodNeighbors(roomInfor, tailTargets[i], result.path);
      if (!neighbors || neighbors.length < 1) continue;

      results.push(result);
    }

    // 2. Find path
    let foodTravel = this.getFoodTravelNo(roomInfor.speed);
    if (foodTravel > roomInfor.foods.length) foodTravel = roomInfor.foods.length;

    const nearestResult = this.aStarSearch(roomInfor, ourHead, roomInfor.foods.map(f => f.coordinate));
    for (let i = 0; i < foodTravel; i++) {
      const food = roomInfor.foods[i];
      let result: AStarResult = null;
      // if (nearestResult.status === AStarStatus.success && CoordinateUtils.isSame(_.last(nearestResult.path), food.coordinate)) {
      //   result = nearestResult;
      // } else {
        result = this.aStarSearch(roomInfor, ourHead, [food.coordinate]);
        if (result.status !== AStarStatus.success) continue;
      // }

      // eliminate food close to the head of a bigger enemy snake
      if (this.enemyDistance(roomInfor, food.coordinate) < 3) continue;

      const firstNode = result.path[0];
      // eliminate paths we can't fit into (compute space size pessimistically)
      if (this.getSpaceSize(roomInfor, firstNode).spaceSize < roomInfor.ourPlayer.segments.length + 2) continue;

      // calculate to next path:

      const endSpzce = this.getSpaceSize(roomInfor, food.coordinate, result.path);
      if (endSpzce.spaceSize < roomInfor.ourPlayer.segments.length + 2) continue;
      // result.path = endSpzce.path;

      result.goal = ResultGoal.food;
      results.push(result);
    }

    const foodDistances = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const foodNode = result.path[result.path.length - 1];
      const ourDistance = CoordinateUtils.distance(ourHead, foodNode);
      const otherDistance = this.enemyDistance(roomInfor, foodNode);
      foodDistances.push({
        foodNode,
        ourDistance,
        enemyDistance: otherDistance,
        advantage: otherDistance - ourDistance
      });
    }

    // Sort follow: lợi thế của mình với địch
    const foodAdvantages = foodDistances.slice().sort((a, b) => b.advantage - a.advantage);
    // Sort follow: dài nhất tới địch
    const foodOpportunities = foodDistances.slice().sort((a, b) => b.enemyDistance - a.enemyDistance);
    const foodAdvantage = foodAdvantages.length && foodAdvantages[0];
    const foodOpportunity = foodOpportunities.length && foodOpportunities[0];
    // adjust the cost of paths
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const path = result.path;
      const endNode = path[path.length - 1];
      // if (path.length > 1) {
      //   const nearEnd = path[path.length - 2];
      //   const featureNode = {
      //     x: endNode.x + (endNode.x - nearEnd.x),
      //     y: endNode.y + (endNode.y - nearEnd.y)
      //   } as Coordinate;
      //   if (MapUtils.isWall(roomInfor.map, featureNode)
      //     || this.isNodeInSnake(roomInfor, featureNode, path)) {
      //     result.cost += COST_MODERATE;
      //   }
      // }

      // heavily if end point has no path back to our tail
      if (!this.hasPathToTail(roomInfor, endNode, roomInfor.ourPlayer)) {
        result.cost += COST_HEAVY;
      }

      // heavily/moderately/lightly if not a food path and we must-eat/should-eat/chase-food
      if (result.goal !== ResultGoal.food) {
        result.cost += COST_MODERATE;
      }

      // lightly if: food path, multiple food paths, not our advantage and not most available
      if (result.goal === ResultGoal.food
        && roomInfor.foods.length > 1
        && foodAdvantage
        && (CoordinateUtils.getHash(endNode) !== CoordinateUtils.getHash(foodAdvantage.foodNode) || foodAdvantage.advantage < 1)
        && foodOpportunity
        && CoordinateUtils.getHash(endNode) !== CoordinateUtils.getHash(foodOpportunity.foodNode)
      ) {
        result.cost += COST_LIGHT;
      }
    }

    // if we found paths to goals, pick cheapest one
    if (results.length) {
      results.sort((a, b) => {
        return a.cost - b.cost;
      });
      const cheapest = results[0];
      // if (cheapest.goal === ResultGoal.food && cheapest.path.length < 4) {
      //   const targetFood = _.last(cheapest.path);
      //   const foods = roomInfor.foods.filter(f => !CoordinateUtils.isSame(f.coordinate, targetFood)).map(f => f.coordinate);
      //   const nextResult = this.aStarSearch(roomInfor, targetFood, foods, cheapest.path);
      //   if (nextResult.status === AStarStatus.success) {
      //     cheapest.path = cheapest.path.concat(nextResult.path);
      //   }
      // }
      // if (cheapest.goal === ResultGoal.tail && cheapest.path.length === 1) {
      //   const step = roomInfor.ourPlayer.segments.length - 1 < 4 ? roomInfor.ourPlayer.segments.length - 1 : 3;
      //   const targetTail = _.last(cheapest.path);
      //   for (let index = roomInfor.ourPlayer.segments.length - 1; index > roomInfor.ourPlayer.segments.length - step; index--) {
      //     if (!CoordinateUtils.isSame(targetTail, roomInfor.ourPlayer.segments[index])) {
      //       cheapest.path.push(roomInfor.ourPlayer.segments[index]);
      //     }
      //   }
      // }
      // results.forEach(r => console.log(r.goal, r.cost, r.path.length));
      return this.res(roomInfor,
        results[0].path,
        'A* BEST PATH TO ' + results[0].goal
      );
    }

    // no best moves, pick the direction that has the most open space
    // first be pessimistic: avoid nodes next to enemy heads and spaces too small for us
    // if that fails, be optimistic: include nodes next to enemy heads and small spaces
    // const moves = this.getSpaciousMoves(roomInfor, roomInfor.ourPlayer);
    // moves.sort((a, b) => {
    //   // don't cut off escape routes
    //   if (a.spaceSize === b.spaceSize) {
    //     return a.wallCost - b.wallCost;
    //   } else {
    //     return b.spaceSize - a.spaceSize;
    //   }
    // });
    const spacePath = this.calculateLongestPath(roomInfor, ourHead);
    if (spacePath.length > 0) {
      return this.res(roomInfor,
        spacePath,
        'NO PATH TO GOAL, LARGEST SPACE'
      );
    }
    // if (moves.length) {
    //   const move = moves[0];
    //   let path = move.direction;
    //   if (move.spaceSize < roomInfor.ourPlayer.segments.length - 5) {
    //     path = this.calculateLongestPath(roomInfor, move.node, move.direction);
    //   }
    //   return this.res(roomInfor,
    //     this.getDirectionsFromPath(roomInfor, [move.node, ...path]),
    //     'NO PATH TO GOAL, LARGEST SPACE'
    //   );
    // }


    return this.res(roomInfor, [CoordinateUtils.nextCoordinate(ourHead, Direction.UP)], 'no valid moves');
  }

  private calculateLongestPath(roomInfor: RoomInfor, ourHead: Coordinate) {
    const space = this.getSpaceSize(roomInfor, ourHead);
    let path = space.path;
    if (path.length > roomInfor.ourPlayer.segments.length + 3 || path.length === 0) {
      console.log(`ESCAPE: Free to go path=${path.length}`);
      return path;
    }
    const escapeResult = this.findEscape(roomInfor, space.seenNodes);
    if (escapeResult.node) {
      const result = this.aStarSearch(roomInfor, ourHead, [escapeResult.node]);
      if (result.status === AStarStatus.success) {
        if (path.length > 0) {
          path = result.path;
        } else {
          console.error(`ESCAPE: Path EMPTY from:`, ourHead, ' => ', escapeResult.node, ', map=', roomInfor);
          return path;
        }
      } else {
        console.error(`ESCAPE: Could not find to: `, escapeResult.node, ', map=', roomInfor);
      }
    } else {
      console.log(`ESCAPE: No way`, ', map=', roomInfor);
    }
    console.log(`ESCAPE: Path from:`, ourHead, ' => ', escapeResult.node, " = ", path);
    const seenNodes = {} as any;
    seenNodes[CoordinateUtils.getHash(ourHead)] = true;
    path.forEach(coord => seenNodes[CoordinateUtils.getHash(coord)] = true);
    let curNode = ourHead;
    let idx = 0;
    while (true) {
      const nextCoord = path[idx];
      const direct = CoordinateUtils.direction(curNode, nextCoord);
      const tests: Direction[] = [];
      if (direct === Direction.LEFT || direct === Direction.RIGHT) {
        tests.push(Direction.UP, Direction.DOWN);
      } else if (direct === Direction.UP || direct === Direction.DOWN) {
        tests.push(Direction.LEFT, Direction.RIGHT);
      }
      let extended = false;
      for (const testDir of tests) {
        const curTest = CoordinateUtils.nextCoordinate(curNode, testDir);
        const nextTest = CoordinateUtils.nextCoordinate(nextCoord, testDir);

        if (!seenNodes[CoordinateUtils.getHash(curTest)] && !seenNodes[CoordinateUtils.getHash(nextTest)]
          && CoordinateUtils.isInNodes(this.validNeighbors(roomInfor, curNode), curTest)
          && CoordinateUtils.isInNodes(this.validNeighbors(roomInfor, nextCoord), nextTest)) {
          seenNodes[CoordinateUtils.getHash(curTest)] = true;
          seenNodes[CoordinateUtils.getHash(nextTest)] = true;
          path.splice(idx, 0, curTest);
          path.splice(idx + 1, 0, nextTest);
          extended = true;
          break;
        }
      }

      if (path.length > escapeResult.length + 2) {
        break;
      }

      if (!extended) {
        curNode = nextCoord;
        if (++idx >= path.length)
          break;
      }
    }
    // console.log(path);
    return path;
  }

  findEscape(roomInfor: RoomInfor, seenNodes: any): { node: Coordinate, length: number } {
    const best = {} as { node: Coordinate, length: number };
    if (roomInfor.ourPlayer.originalLength > 1) {
      const b = this.findEscapePlayer(roomInfor, roomInfor.ourPlayer, 1
        , roomInfor.ourPlayer.segments.length - 1, seenNodes, new Dictionary());
      if (b) {
        const length = CoordinateUtils.distance(roomInfor.ourPlayer.tail, b);
        if (!best.node || best.length > length) {
          best.length = length;
          best.node = b;
        }
      }
    }
    roomInfor.otherPlayers.forEach(p => {
      const b = this.findEscapePlayer(roomInfor, p, 0, p.segments.length - 1, seenNodes, new Dictionary());
      if (b) {
        const length = CoordinateUtils.distance(p.tail, b);
        if (!best.node || best.length > length) {
          best.length = length;
          best.node = b;
        }
      }
    });
    return best;
  }

  findEscapePlayer(roomInfor: RoomInfor, p: Player, start: number, end: number
    , seenNodes: any, checkedNodes: Dictionary<string, boolean>): Coordinate {
    const index = start + Math.floor((end - start) / 2);
    const checkingNode = p.segments[index];
    const checkingHash = CoordinateUtils.getHash(checkingNode);

    if (checkedNodes.containsKey(checkingHash)) {
      return checkedNodes.getValue(checkingHash) ? checkingNode : null;
    }
    const neighours = this.validNeighbors(roomInfor, checkingNode);
    const valid = neighours.findIndex(n => seenNodes[CoordinateUtils.getHash(n)]) >= 0;
      // && neighours.findIndex(n => seenNodes[CoordinateUtils.getHash(n)]) < 0;
    checkedNodes.setValue(checkingHash, valid);
    if (valid) {
      return this.findEscapePlayer(roomInfor, p, index, end, seenNodes, checkedNodes);
    } else {
      return this.findEscapePlayer(roomInfor, p, start, index, seenNodes, checkedNodes);
    }
  }

  // getSpaciousMoves(roomInfor: RoomInfor, snake: Player) {
  //   const moves = [];
  //   const ourHead = _.first(snake.segments);
  //   const headNeighbors = this.validNeighbors(roomInfor, ourHead);

  //   for (let i = 0; i < headNeighbors.length; i++) {
  //     const neighbor = headNeighbors[i];
  //     const spaceSize = this.getSpaceSize(roomInfor, neighbor);
  //     moves.push({
  //       node: neighbor,
  //       direction: spaceSize.path,
  //       spaceSize: spaceSize.spaceSize,
  //       wallCost: MapUtils.getWallCost(roomInfor.map, neighbor),
  //       isNextMove: this.isPossibleNextMoveOfOtherSnake(roomInfor, neighbor)
  //     });
  //   }
  //   return moves;
  // }
  res(roomInfor: RoomInfor, dirs: Coordinate[], des: string) {
    const dirString = this.getDirectionsFromPath(roomInfor, dirs);
    if (dirString) {
      this._server.drive(dirString);
      console.log(des, `[Ori_L=${roomInfor.ourPlayer.originalLength}]-[[Cur_L=${roomInfor.ourPlayer.segments.length}]]:`, dirString);
    }
    roomInfor.direction = {
      dirs: dirs,
      title: des
    };
    // console.timeEnd("snake");
  }

  getDirectionsFromPath(roomInfor: RoomInfor, path: Coordinate[]) {
    let dirs = "";
    let last = roomInfor.ourPlayer.head;
    path.forEach(coord => {
      dirs += CoordinateUtils.direction(last, coord) || "";
      last = coord;
    });
    return dirs;
  }

  hasPathToTail(roomInfor: RoomInfor, startNode: Coordinate, snake: Player): any {
    const result = this.aStarSearch(roomInfor, startNode, this.validNeighbors(roomInfor, snake.tail));
    return result.status === AStarStatus.success;
  }

  getSpaceSize(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]): {
    spaceSize: number, path: Coordinate[], seenNodes: any
  } {
    let val = roomInfor.cachedSpaces.getValue(CoordinateUtils.getHash(node));
    if (!val) {
      const validNodes = [{ node, path: ourPath ? [...ourPath] : [] }];
      const seenNodes = {} as any;
      seenNodes[CoordinateUtils.getHash(node)] = true;

      for (let i = 0; i < validNodes.length; i++) {
        const computingNode = validNodes[i];
        // compute distance from current node to start node and subtract it from tails
        // const tailTrim = CoordinateUtils.distance(node, computingNode.node);

        const neighbors = this.validNeighbors(roomInfor, computingNode.node, computingNode.path);
        for (let j = 0; j < neighbors.length; j++) {
          if (!seenNodes[CoordinateUtils.getHash(neighbors[j])]) {
            seenNodes[CoordinateUtils.getHash(neighbors[j])] = true;
            validNodes.push({ node: neighbors[j], path: [...computingNode.path, neighbors[j]] });
          }
        }
      }
      val = {
        seenNodes,
        spaceSize: validNodes.length,
        path: _.last(validNodes).path
      };
      roomInfor.cachedSpaces.setValue(CoordinateUtils.getHash(node), val);
    }
    return val;
  }

  enemyDistance(roomInfor: RoomInfor, coord: Coordinate): any {
    return roomInfor.otherPlayers.reduce((closest, current) => {
      return Math.min(CoordinateUtils.distance(coord, current.head), closest);
    }, Number.MAX_SAFE_INTEGER);
  }

  isPossibleNextMoveOfOtherSnake(roomInfor: RoomInfor, node: Coordinate): any {
    const filtered = roomInfor.otherPlayers.filter((player) => {
      return CoordinateUtils.isInNodes(CoordinateUtils.neighbors(player.head), node);
    });
    return filtered.length > 0;
  }

  isNodeInSnake(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]): any {
    const dirLength = ourPath ? ourPath.length : 0;
    for (let i = 0; i < roomInfor.otherPlayers.length; i++) {
      if (CoordinateUtils.isInNodes(roomInfor.otherPlayers[i].segments, node, dirLength)) {
        return true;
      }
    }
    if (CoordinateUtils.isInNodes(roomInfor.ourPlayer.segments, node, dirLength)) {
      return true;
    } else {
      const start = dirLength - roomInfor.ourPlayer.segments.length;
      if (start > 0)
        for (let index = start; index < dirLength; index++) {
          if (CoordinateUtils.isSame(ourPath[index], node)) {
            return true;
          }
        }
    }
    return false;
  }

  goodNeighbors(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]) {
    return this.validNeighbors(roomInfor, node, ourPath).filter((n) => {
      // don't consider nodes adjacent to the head of another snake
      return !this.isPossibleNextMoveOfOtherSnake(roomInfor, n);
    });
  }

  validNeighbors(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]) {
    return CoordinateUtils.neighbors(node).filter((nb) => {
      // if (ourPath && ourPath.length > 1 && CoordinateUtils.isSame(ourPath[1], nb)) return false;

      // walls are not valid
      if (MapUtils.isWall(roomInfor.map, nb)) return false;

      // don't consider occupied nodes unless they are moving tails
      if (this.isNodeInSnake(roomInfor, nb, ourPath) && !this.isMovingTail(roomInfor, nb)) return false;

      // custom wall!!! return false;

      // looks valid
      return true;
    });
  }

  isMovingTail(roomInfor: RoomInfor, node: Coordinate): any {
    for (let i = 0; i < roomInfor.players.length; i++) {
      const body = roomInfor.players[i].segments;

      // if it's not the tail node, consider next snake
      if (!CoordinateUtils.isSame(node, body[body.length - 1])) continue;

      // if snake is growing, tail won't move
      if (PlayerUtils.isGrowing(roomInfor.players[i])) return false;

      // must be a moving tail
      return true;
    }
    return false;
  }

  //#region A-START search
  private aStarSearch(roomInfor: RoomInfor, start: Coordinate, targets: Coordinate[], ourPath?: Coordinate[]): AStarResult {
    const options = {
      start: start,
      isEnd: (node: Coordinate) => CoordinateUtils.isInNodes(targets, node),
      neighbor: (node: Coordinate, path: Coordinate[]) => this.goodNeighbors(roomInfor, node, ourPath ? ourPath.concat(path) : path),
      distance: CoordinateUtils.distance,
      heuristic: (node) => this.heuristic(roomInfor, node),
      hash: CoordinateUtils.getHash,
      timeout: SEARCH_TIMEOUT
    };
    return aStar(options);
  }

  heuristic(roomInfor: RoomInfor, node: Coordinate) {
    // cost goes up if node is close to a wall because that limits escape routes
    let cost = MapUtils.getWallCost(roomInfor.map, node);

    // cost goes up if node is close to another snake
    cost += this.getProximityToSnakes(roomInfor, node);

    return cost;
  }

  getProximityToSnakes(roomInfor: RoomInfor, node: Coordinate): any {
    let proximity = 0;
    const quarterBoard = Math.min(roomInfor.map.vertical, roomInfor.map.horizontal) / 4;
    for (let i = 0; i < roomInfor.players.length; i++) {
      const player = roomInfor.players[i];
      if (PlayerUtils.isOurPlayer(player)) continue;

      const gap = CoordinateUtils.distance(player.head, node);

      // insignificant proximity if > 1/4 of the board away
      if (gap >= quarterBoard) continue;

      proximity += (quarterBoard - gap) * 10;
    }
    return proximity;
  }
  //#endregion
}
