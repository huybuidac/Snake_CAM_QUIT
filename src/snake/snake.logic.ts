import { element } from 'protractor';
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
import { delay } from 'rxjs/operators';
import { of } from 'rxjs';
import { objectUtils } from './utiles';

const SEARCH_TIMEOUT = 50;
const COST_HEAVY = 1000;
const COST_MODERATE = 250;
const COST_LIGHT = 100;

enum NodeState {
  None = 0,
  NearEdge = 1,
  Grow = 2,
  Intercept = 4, // in the half step near our
  NearEageAndIntercept = 5
}

interface NodeContainer {
  state?: NodeState;
  node?: Coordinate;
  path?: Coordinate[];
  level?: number;
}

interface NodesLevel {
  level: number;
  nodes: NodeContainer[];
  hasIntercept?: boolean;
}

interface SpaceContainer {
  player?: Player;
  validNodes?: NodeContainer[]; // all node can travel
  seenNodes?: Dictionary<string, NodeContainer>; // all node indexed by xy
  nodeLevels?: NodesLevel[]; // phân cấp
  total?: number;
  totalWithoutIntercept?: number;
  stop?: boolean;
  levelMeetEnemyHead?: number;
}

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

  async killEnemy(roomInfor: RoomInfor) {
    RoomUtils.normalize(roomInfor);
    const ourHead = roomInfor.ourPlayer.head;
    const ourTail = roomInfor.ourPlayer.tail;

    const me = roomInfor.ourPlayer;
    const enemy = roomInfor.otherPlayers[0];

    // setup space container
    let start = { node: ourHead, path: [ourHead] };
    const ourSpace: SpaceContainer = {
      player: me,
      validNodes: [start],
      seenNodes: new Dictionary(),
      nodeLevels: [{ level: 0, nodes: [start] }]
    };
    ourSpace.seenNodes.setValue(CoordinateUtils.getHash(ourHead), start);
    start = { node: enemy.head, path: [enemy.head] };
    const enemySpace: SpaceContainer = {
      player: enemy,
      validNodes: [start],
      seenNodes: new Dictionary(),
      nodeLevels: [{ level: 0, nodes: [start] }]
    };
    enemySpace.seenNodes.setValue(CoordinateUtils.getHash(enemy.head), start);

    roomInfor.direction = { dirs: [] };
    while (true) {
      this.calculateSpacesOnLevel(ourSpace, roomInfor);
      this.calculateSpacesOnLevel(enemySpace, roomInfor);

      const lastOurLevel = _.last(ourSpace.nodeLevels);
      const lastEnemyLevel = _.last(enemySpace.nodeLevels);

      // 1. Cal intercept
      this.calculateIntercept(enemySpace, lastEnemyLevel, ourSpace);
      this.calculateIntercept(ourSpace, lastOurLevel, enemySpace);

      roomInfor.direction.dirs = [...lastEnemyLevel.nodes.map(t => t.node), ...lastOurLevel.nodes.map(t => t.node)];
      this._server.roomInfor$.next(roomInfor);
      // await of(1).pipe(delay(200)).toPromise();

      // 2. handle logic to kill when both finish
      if (ourSpace.stop && enemySpace.stop) {

        // 3. no need to handle when enemy can escape
        if (enemySpace.totalWithoutIntercept > enemySpace.player.segments.length) {
          break;
        } else {
          // find longest way to block

          const firtIntercept = enemySpace.nodeLevels.findIndex(nl => nl.hasIntercept);
          for (let index = enemySpace.levelMeetEnemyHead; index >= firtIntercept; index--) {
            const level = enemySpace.nodeLevels[index];
            if (level.nodes.length === 1) {
              // todo calculate to return head
            }
          }
          const first = enemySpace.nodeLevels.find(nl => nl.hasIntercept && nl.nodes.findIndex(n =>
            (n.state & NodeState.NearEageAndIntercept) === NodeState.NearEageAndIntercept) >= 0);
          // .nodes.filter(nz => nz.state & NodeState.NearEdge);
          const result = this.aStarSearch(roomInfor, ourHead, first.nodes.filter(n =>
            (n.state & NodeState.NearEageAndIntercept) === NodeState.NearEageAndIntercept).map(n => n.node));
          console.log(first, result);
          roomInfor.direction.dirs = result.path;
          this._server.roomInfor$.next(roomInfor);
        }
        break;
      }

    }
  }

  private calculateIntercept(target: SpaceContainer, lastEnemyLevel: NodesLevel, compare: SpaceContainer) {
    if (!target.stop) {
      lastEnemyLevel.nodes.forEach(ln => {
        if (compare.seenNodes.getValue(CoordinateUtils.getHash(ln.node))) {
          lastEnemyLevel.hasIntercept = true;
          ln.state = NodeState.Intercept;
          target.totalWithoutIntercept--;
        }
        if (!target.levelMeetEnemyHead && compare.nodeLevels.length > 1) {
          if (compare.nodeLevels[1].nodes.find(n => CoordinateUtils.isSame(n.node, ln.node))) {
            target.levelMeetEnemyHead = lastEnemyLevel.level;
          }
        }
      });
    }
  }

  private calculateSpacesOnLevel(space: SpaceContainer, roomInfor: RoomInfor) {
    const lastLevel = _.last(space.nodeLevels);
    const nextLevel: NodesLevel = { level: lastLevel.level + 1, nodes: [] };
    if (lastLevel.nodes.length > 0) {
      lastLevel.nodes.forEach(computingNode => {
        const neighbors = this.validNeighbors(roomInfor, computingNode.node, computingNode.path, space.player);
        neighbors.forEach(neighbor => {
          const nodeContainer = { node: neighbor, path: [...computingNode.path, neighbor], state: NodeState.None };
          if (!space.seenNodes.getValue(CoordinateUtils.getHash(neighbor))) {
            space.seenNodes.setValue(CoordinateUtils.getHash(neighbor), nodeContainer);
            space.validNodes.push(nodeContainer);
            nextLevel.nodes.push(nodeContainer);
            space.total++;
            space.totalWithoutIntercept++;
          }
        });
        if (neighbors.length === 3) {
          computingNode.state = computingNode.state | NodeState.Grow;
        } else {
          // no way
          computingNode.state = computingNode.state | NodeState.NearEdge;
        }
      });
      space.nodeLevels.push(nextLevel);
    }
    space.stop = nextLevel.nodes.length === 0;
  }

  updateRoom(roomInfor: RoomInfor) {
    console.time("snake");

    // RoomUtils.normalize(roomInfor);
    const ourHead = roomInfor.ourPlayer.head;
    const ourTail = roomInfor.ourPlayer.tail;

    // const spaceVals = this.getSpaceSize(roomInfor, ourHead);
    // this.calculateLongestPath(roomInfor, ourHead, spaceVals.path);
    // return;
    // 1. Sort Food by our head
    FoodUtils.calculateValues(roomInfor.foods);
    FoodUtils.sort(roomInfor.foods, ourHead);
    const results: AStarResult[] = [];

    let tailLength = 0;
    if (!CoordinateUtils.isSame(ourHead, ourTail)) {
      const result = this.aStarSearch(roomInfor, ourHead, [ourTail]);
      if (result.status === AStarStatus.success) {
        result.goal = ResultGoal.tail;
        const remain = roomInfor.ourPlayer.segments.length - roomInfor.ourPlayer.originalLength;
        const clonedPath = [...result.path];
        if (this.findFitPath(roomInfor, ourHead, { node: ourTail, length: remain }, clonedPath)) {
          result.path = clonedPath;
          results.push(result);
          tailLength = result.path.length;
        }
      }
    }

    // START force WIN:
    // **** Condition:
    // - our score > 40

    // 1. tim duong den check_point_1
    // 2. tim duong den check_point_2 bang allowed_place
    // const ourPlayer = roomInfor.ourPlayer;
    // if (ourPlayer.score > 40) {

    //   // check we passed check_point_1
    //   // - true => find to check_point_2
    //   let lastPassedCheckpoint_1 = false;
    //   const point_1_index = ourPlayer.segments.findIndex(seg => CoordinateUtils.isInNodes(roomInfor.zone.check_point, seg));
    //   if (point_1_index >= 0) {
    //     console.log(`point_1_index=${point_1_index} check segments=`, ourPlayer.segments.slice(0, point_1_index + 1));
    //     const validLastPath = ourPlayer.segments.slice(0, point_1_index + 1).findIndex(segment => !CoordinateUtils.isInNodes(roomInfor.zone.allowed_place, segment));
    //     console.log(`validLastPath=${validLastPath}`);
    //     if (validLastPath < 0) {
    //       lastPassedCheckpoint_1 = true;
    //       const check_point_1 = ourPlayer.segments[point_1_index];
    //       let check_point_2: Coordinate;
    //       if (CoordinateUtils.isSame(roomInfor.zone.check_point[0], check_point_1)) {
    //         check_point_2 = roomInfor.zone.check_point[1];
    //       } else {
    //         check_point_2 = roomInfor.zone.check_point[0];
    //       }
    //       const point2Result = this.aStarCheckPoint(roomInfor, ourHead, check_point_2);
    //       if (point2Result.status === AStarStatus.success) {
    //         return this.res(roomInfor,
    //           point2Result.path,
    //           'PATH to WINNNNNNN-2'
    //         );
    //       }
    //     }
    //   }
    //   if (!lastPassedCheckpoint_1) {
    //     const point1Result = this.aStarSearch(roomInfor, ourHead, roomInfor.zone.check_point);
    //     if (point1Result.status === AStarStatus.success) {
    //       const check_point_1 = _.last(point1Result.path);
    //       console.log(`point1Result`, point1Result, 'check_point_1=', check_point_1);
    //       // const targetFood = roomInfor.foods.find(f => CoordinateUtils.isSame(f.coordinate, targetFoodPoint));
    //       // const foods = roomInfor.foods.filter(f => !CoordinateUtils.isSame(f.coordinate, targetFoodPoint));
    //       const clonedRoom = objectUtils.cloneObject(roomInfor) as RoomInfor;
    //       RoomUtils.normalize(clonedRoom);
    //       // clonedRoom.foods = foods;
    //       // clonedRoom.ourPlayer.score += targetFood.value;
    //       // console.log("a score=", clonedRoom.ourPlayer.score);
    //       const originalLength = clonedRoom.ourPlayer.segments.length;
    //       clonedRoom.ourPlayer.segments = point1Result.path.slice().reverse().concat(clonedRoom.ourPlayer.segments);
    //       // console.log("a merge=", [...clonedRoom.ourPlayer.segments]);
    //       clonedRoom.ourPlayer.segments = clonedRoom.ourPlayer.segments.slice(0, originalLength);
    //       // console.log("a slice=", [...clonedRoom.ourPlayer.segments]);
    //       clonedRoom.otherPlayers.forEach(p => p.segments = p.segments.slice(point1Result.path.length));
    //       RoomUtils.normalize(clonedRoom);

    //       // 2: tim duong den check_point_2 bang allowed_place
    //       let check_point_2: Coordinate;
    //       if (CoordinateUtils.isSame(clonedRoom.zone.check_point[0], check_point_1)) {
    //         check_point_2 = clonedRoom.zone.check_point[1];
    //       } else {
    //         check_point_2 = clonedRoom.zone.check_point[0];
    //       }
    //       const point2Result = this.aStarCheckPoint(clonedRoom, check_point_1, check_point_2);
    //       if (point2Result.status === AStarStatus.success) {
    //         const path = point1Result.path.concat(point2Result.path);
    //         return this.res(roomInfor,
    //           path,
    //           'PATH to WINNNNNNN-1'
    //         );
    //       }
    //     }
    //   }
    // }

    let weBest = true;
    roomInfor.otherPlayers.forEach(p => {
      if (p.score + 10 > roomInfor.ourPlayer.score) {
        weBest = false;
      }
    });
    // 2. Find path
    let foodTravel = this.getFoodTravelNo(roomInfor.speed);
    if (foodTravel > roomInfor.foods.length) foodTravel = roomInfor.foods.length;

    const nearestResult = this.aStarSearch(roomInfor, ourHead, roomInfor.foods.map(f => f.coordinate));
    for (let i = 0; i < foodTravel; i++) {
      const food = roomInfor.foods[i];
      let result: AStarResult = null;
      if (nearestResult.status === AStarStatus.success && CoordinateUtils.isSame(_.last(nearestResult.path), food.coordinate)) {
        result = nearestResult;
      } else {
        result = this.aStarSearch(roomInfor, ourHead, [food.coordinate]);
        if (result.status !== AStarStatus.success) continue;
      }

      if (roomInfor.ourPlayer.score > 120 && !weBest) {
        if (tailLength > 15 || result.path.length > 5) {
          console.log('remove xxxxx', tailLength, result.path.length);
          continue;
        }
      }

      // eliminate food close to the head of a bigger enemy snake
      if (this.enemyDistance(roomInfor, food.coordinate) < 3) continue;

      // const firstNode = result.path[0];
      // eliminate paths we can't fit into (compute space size pessimistically)
      // if (this.getSpaceSize(roomInfor, firstNode, [firstNode]).spaceSize < roomInfor.ourPlayer.segments.length + 2) continue;

      // calculate to next path:
      if (!this.hasPathToTail(roomInfor, food.coordinate, roomInfor.ourPlayer, result.path)) continue;

      const endSpzce = this.getSpaceSize(roomInfor, food.coordinate, result.path);
      if (endSpzce.spaceSize < roomInfor.ourPlayer.segments.length + food.value) continue;
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

      // heavily if end point has no path back to our tail


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
      let handle = true;
      const cheapest = results[0];
      if (cheapest.goal === ResultGoal.food) {
        const targetFoodPoint = _.last(cheapest.path);
        const targetFood = roomInfor.foods.find(f => CoordinateUtils.isSame(f.coordinate, targetFoodPoint));
        const foods = roomInfor.foods.filter(f => !CoordinateUtils.isSame(f.coordinate, targetFoodPoint));
        const clonedRoom = objectUtils.cloneObject(roomInfor) as RoomInfor;
        RoomUtils.normalize(clonedRoom);
        clonedRoom.foods = foods;
        clonedRoom.ourPlayer.score += targetFood.value;
        // console.log("a score=", clonedRoom.ourPlayer.score);
        const originalLength = clonedRoom.ourPlayer.segments.length;
        clonedRoom.ourPlayer.segments = cheapest.path.slice().reverse().concat(clonedRoom.ourPlayer.segments);
        // console.log("a merge=", [...clonedRoom.ourPlayer.segments]);
        clonedRoom.ourPlayer.segments = clonedRoom.ourPlayer.segments.slice(0, originalLength);
        // console.log("a slice=", [...clonedRoom.ourPlayer.segments]);
        clonedRoom.otherPlayers.forEach(p => p.segments = p.segments.slice(cheapest.path.length));
        RoomUtils.normalize(clonedRoom);
        // console.log("a normalize=", [...clonedRoom.ourPlayer.segments]);
        const morePath = this.calculateSpacePath(clonedRoom, targetFoodPoint);
        // console.log("a morePath=", [...morePath]);
        if (morePath.length > 0) {
          cheapest.path = cheapest.path.concat(morePath);
        } else {
          handle = false;
        }
        // console.log("a morePath=", [...cheapest.path]);
        // clonedRoom.foods = foods
        // const targetFood = _.last(cheapest.path);
        // const foods = roomInfor.foods.filter(f => !CoordinateUtils.isSame(f.coordinate, targetFood)).map(f => f.coordinate);
        // const nextResult = this.aStarSearch(roomInfor, targetFood, foods, cheapest.path);
        // if (nextResult.status === AStarStatus.success) {
        //   cheapest.path = cheapest.path.concat(nextResult.path);
        // }
      }
      if (cheapest.goal === ResultGoal.tail && cheapest.path.length === 1) {
        const step = roomInfor.ourPlayer.segments.length - 1 < 7 ? roomInfor.ourPlayer.segments.length - 1 : 6;
        const targetTail = _.last(cheapest.path);
        for (let index = roomInfor.ourPlayer.segments.length - 1; index > roomInfor.ourPlayer.segments.length - step; index--) {
          if (!CoordinateUtils.isSame(targetTail, roomInfor.ourPlayer.segments[index])) {
            cheapest.path.push(roomInfor.ourPlayer.segments[index]);
          }
        }
      }
      if (handle) {
        return this.res(roomInfor,
          results[0].path,
          'A* BEST PATH TO ' + results[0].goal
        );
      }
    }

    let spacePath = this.calculateSpacePath(roomInfor, ourHead);
    if (spacePath.length > 0) {
      return this.res(roomInfor,
        spacePath,
        'SPACE without next'
      );
    } else {
      spacePath = this.calculateSpacePath(roomInfor, ourHead, false);
      if (spacePath.length > 0) {
        return this.res(roomInfor,
          spacePath,
          'SPACE without next'
        );
      }
    }
    console.error("no-valid", JSON.stringify(roomInfor));
    return this.res(roomInfor, [CoordinateUtils.nextCoordinate(ourHead, Direction.UP)], 'no valid moves');
  }

  // find the way in map
  private calculateSpacePath(roomInfor: RoomInfor, ourHead: Coordinate, ignoreEnemeyNextNodes = true) {
    const space = this.getSpaceSize(roomInfor, ourHead, null, ignoreEnemeyNextNodes);
    let spacePath = space.path;
    if (spacePath.length > roomInfor.ourPlayer.segments.length + 3 || spacePath.length === 0) {
      // if (roomInfor.ourPlayer.originalLength < 3 || spacePath.length === 0) {
      return spacePath;
    }
    // const a = [];
    // for (const key in space.seenNodes) {
    //   if (space.seenNodes.hasOwnProperty(key)) {
    //     const aaaa = key.split(",");
    //     a.push({x: aaaa[0], y: aaaa[1]});
    //   }
    // }
    // return a;
    const escapeResults = this.findEscape(roomInfor, space.seenNodes, ignoreEnemeyNextNodes);
    let escaped = false;
    for (let index = 0; index < escapeResults.length; index++) {
      const escapeResult = escapeResults[index];

      const path = this.findPathToEscape(roomInfor, ourHead, escapeResult, [...spacePath], ignoreEnemeyNextNodes);
      if (path) {
        spacePath = path;
        escaped = true;
        break;
      }

    }

    if (!escaped && !ignoreEnemeyNextNodes) {
      this.findFitPath(roomInfor, ourHead, {
        node: _.last(spacePath),
        length: roomInfor.ourPlayer.segments.length
      }, spacePath, ignoreEnemeyNextNodes);
    }

    // console.log(path);
    return spacePath;
  }

  findPathToEscape(roomInfor: RoomInfor, ourHead: Coordinate, escapeResult: { node: Coordinate, length: number },
    path: Coordinate[], ignoreEnemeyNextNodes = true) {
    if (escapeResult.node) {
      const result = this.aStarSearch(roomInfor, ourHead, [escapeResult.node], null, null, [escapeResult.node], ignoreEnemeyNextNodes);
      if (result.status === AStarStatus.success) {
        path = result.path;
      } else {
        console.error(`ESCAPE: Could not find to: `, escapeResult.node, ', map=', JSON.stringify(roomInfor));
        return null;
      }
    } else {
      console.log(`ESCAPE: No way`, ', map=', JSON.stringify(roomInfor));
    }
    const escaped = this.findFitPath(roomInfor, ourHead, escapeResult, path, ignoreEnemeyNextNodes);
    return escaped ? path : null;
  }

  findFitPath(roomInfor: RoomInfor, ourHead: Coordinate,
    escapeResult: { node: Coordinate, length: number }, path: Coordinate[], ignoreEnemeyNextNodes = true) {
    const seenNodes = {} as any;
    seenNodes[CoordinateUtils.getHash(ourHead)] = true;
    path.forEach(coord => seenNodes[CoordinateUtils.getHash(coord)] = true);
    let curNode = ourHead;
    let idx = 0;
    let escaped = false;
    while (true) {
      if (path.length > escapeResult.length) {
        escaped = true;
        break;
      }
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
          && CoordinateUtils.isInNodes(ignoreEnemeyNextNodes ? this.goodNeighbors(roomInfor, curNode) : this.validNeighbors(roomInfor, curNode), curTest)
          && CoordinateUtils.isInNodes(ignoreEnemeyNextNodes ? this.goodNeighbors(roomInfor, nextCoord) : this.validNeighbors(roomInfor, nextCoord), nextTest)) {
          seenNodes[CoordinateUtils.getHash(curTest)] = true;
          seenNodes[CoordinateUtils.getHash(nextTest)] = true;
          path.splice(idx, 0, curTest);
          path.splice(idx + 1, 0, nextTest);
          extended = true;
          break;
        }
      }

      if (!extended) {
        curNode = nextCoord;
        if (++idx >= path.length)
          break;
      }
    }
    return escaped;
  }

  findEscape(roomInfor: RoomInfor, seenNodes: any, ignoreEnemeyNextNodes = true): { node: Coordinate, length: number }[] {
    const best: { node: Coordinate, length: number }[] = [];
    if (roomInfor.ourPlayer.originalLength > 1) {
      const b = this.findEscapePlayer(roomInfor, roomInfor.ourPlayer, 1
        , roomInfor.ourPlayer.segments.length - 1, seenNodes, new Dictionary(), ignoreEnemeyNextNodes);
      if (b) {
        b.length += 1;
        best.push(b);
      }
    }
    roomInfor.otherPlayers.forEach(p => {
      const b = this.findEscapePlayer(roomInfor, p, 0, p.segments.length - 1, seenNodes, new Dictionary(), ignoreEnemeyNextNodes);
      if (b) {
        b.length += 3;
        best.push(b);
      }
    });
    return best;
  }

  findEscapePlayer(roomInfor: RoomInfor, p: Player, start: number, end: number
    , seenNodes: any, checkedNodes: Dictionary<string, boolean>, ignoreEnemeyNextNodes = true): { node: Coordinate, length: number } {
    const index = start + Math.floor((end - start) / 2);
    const checkingNode = p.segments[index];
    const checkingHash = CoordinateUtils.getHash(checkingNode);

    if (checkedNodes.containsKey(checkingHash)) {
      let length = p.segments.length - index;
      if (CoordinateUtils.isSame(p.tail, checkingNode)) {
        length = p.segments.length - p.originalLength;
      }
      return checkedNodes.getValue(checkingHash) ? { node: checkingNode, length } : null;
    }
    const neighours = ignoreEnemeyNextNodes ? this.goodNeighbors(roomInfor, checkingNode) : this.validNeighbors(roomInfor, checkingNode);
    const valid = neighours.findIndex(n => seenNodes[CoordinateUtils.getHash(n)]) >= 0;
    // && neighours.findIndex(n => seenNodes[CoordinateUtils.getHash(n)]) < 0;
    checkedNodes.setValue(checkingHash, valid);
    if (valid) {
      return this.findEscapePlayer(roomInfor, p, index, end, seenNodes, checkedNodes, ignoreEnemeyNextNodes);
    } else {
      return this.findEscapePlayer(roomInfor, p, start, index, seenNodes, checkedNodes, ignoreEnemeyNextNodes);
    }
  }

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
    console.timeEnd("snake");
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

  hasPathToTail(roomInfor: RoomInfor, startNode: Coordinate, snake: Player, path: Coordinate[]): any {
    const result = this.aStarSearch(roomInfor, startNode, [snake.tail], path);
    return result.status === AStarStatus.success;
  }

  getSpaceSize(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[], ignoreEnemeyNextNodes = true): {
    spaceSize: number, path: Coordinate[], seenNodes: any
  } {
    let val = null; // roomInfor.cachedSpaces.getValue(CoordinateUtils.getHash(node));
    if (!val) {
      const validNodes = [{ node, path: ourPath ? [...ourPath] : [] }];
      const seenNodes = {} as any;
      seenNodes[CoordinateUtils.getHash(node)] = true;

      for (let i = 0; i < validNodes.length; i++) {
        const computingNode = validNodes[i];

        const neighbors = ignoreEnemeyNextNodes ? this.goodNeighbors(roomInfor, computingNode.node, computingNode.path)
          : this.validNeighbors(roomInfor, computingNode.node, computingNode.path);
        for (let j = 0; j < neighbors.length; j++) {
          if (!seenNodes[CoordinateUtils.getHash(neighbors[j])]) {
            seenNodes[CoordinateUtils.getHash(neighbors[j])] = true;
            validNodes.push({ node: neighbors[j], path: [...computingNode.path, neighbors[j]] });
          }
        }
      }
      val = {
        seenNodes,
        spaceSize: validNodes.length - 1,
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

  isNodeInSnake(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[], targetSnake?: Player): any {
    const dirLength = ourPath ? ourPath.length : 0;
    let otherPlayer = roomInfor.otherPlayers;
    let ourPlayer = roomInfor.ourPlayer;
    if (targetSnake) {
      otherPlayer = roomInfor.players.filter(p => p.name !== targetSnake.name);
      ourPlayer = targetSnake;
    }
    for (let i = 0; i < otherPlayer.length; i++) {
      if (CoordinateUtils.isInNodes(otherPlayer[i].segments, node, dirLength)) {
        return true;
      }
    }
    if (CoordinateUtils.isInNodes(ourPlayer.segments, node, dirLength)) {
      return true;
    } else if (ourPath && CoordinateUtils.isInNodes(ourPath, node)) {
      return true;
    } else {
      const start = dirLength - ourPlayer.segments.length;
      if (start >= 0)
        for (let index = start; index < dirLength; index++) {
          if (CoordinateUtils.isSame(ourPath[index], node)) {
            return true;
          }
        }
    }
    return false;
  }

  goodNeighbors(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[], targetSnake?: Player, ignoreNodes?: Coordinate[]) {
    return this.validNeighbors(roomInfor, node, ourPath, targetSnake, ignoreNodes).filter((n) => {
      // don't consider nodes adjacent to the head of another snake
      return !this.isPossibleNextMoveOfOtherSnake(roomInfor, n);
    });
  }

  validNeighbors(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[], targetSnake?: Player, ignoreNodes?: Coordinate[]) {
    return CoordinateUtils.neighbors(node).filter((nb) => {
      // if (ourPath && ourPath.length > 1 && CoordinateUtils.isSame(ourPath[1], nb)) return false;

      // walls are not valid
      if (MapUtils.isWall(roomInfor.map, nb, roomInfor.wall)) return false;

      // don't consider occupied nodes unless they are moving tails
      // ignore nodes
      if (!(ignoreNodes && CoordinateUtils.isInNodes(ignoreNodes, nb))
        && this.isNodeInSnake(roomInfor, nb, ourPath, targetSnake) && !this.isMovingTail(roomInfor, nb)) return false;

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
  private aStarSearch(roomInfor: RoomInfor, start: Coordinate, targets: Coordinate[],
    ourPath?: Coordinate[], targetSnake?: Player, ignoreNodes?: Coordinate[], ignoreEnemeyNextNodes = true
  ): AStarResult {
    const options = {
      start: start,
      isEnd: (node: Coordinate) => CoordinateUtils.isInNodes(targets, node),
      neighbor: (node: Coordinate, path: Coordinate[]) => ignoreEnemeyNextNodes
        ? this.goodNeighbors(roomInfor, node, ourPath ? ourPath.concat(path) : path, targetSnake, ignoreNodes)
        : this.validNeighbors(roomInfor, node, ourPath ? ourPath.concat(path) : path, targetSnake, ignoreNodes),
      distance: CoordinateUtils.distance,
      heuristic: (node) => this.heuristic(roomInfor, node),
      hash: CoordinateUtils.getHash,
      timeout: SEARCH_TIMEOUT
    };
    return aStar(options);
  }

  private aStarCheckPoint(roomInfor: RoomInfor, checkPoint1: Coordinate, checkPoint2: Coordinate,
    ourPath?: Coordinate[], targetSnake?: Player, ignoreNodes?: Coordinate[]
  ): AStarResult {
    const options = {
      start: checkPoint1,
      isEnd: (node: Coordinate) => CoordinateUtils.isSame(checkPoint2, node),
      neighbor: (node: Coordinate, path: Coordinate[]) => {
        const neightBors = this.goodNeighbors(roomInfor, node, ourPath ? ourPath.concat(path) : path, targetSnake, ignoreNodes);
        return neightBors.filter(n => CoordinateUtils.isInNodes(roomInfor.zone.allowed_place, n));
      },
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
