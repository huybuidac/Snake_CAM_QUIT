// import { MapInfo } from './../models/map.model';
// import { AStarResult, AStarStatus, ResultGoal } from './../app/a-star';
// import { Direction } from './../models/direction.enum';
// import { Coordinate, CoordinateUtils } from './../models/coordinate.model';
// import { RoomInfor, RoomUtils } from '../models/roomInfo.model';
// import { SocketService } from '../app/socket.service';
// import * as _ from 'lodash';
// import { aStar } from '../app/a-star';
// import { Player, PlayerUtils } from '../models/player.model';
// import { environment } from '../environments/environment';
// import { MapUtils } from '../models/map.model';
// import { Dictionary } from 'typescript-collections';
// import { FoodUtils } from '../models/food.model';

// const SEARCH_TIMEOUT = 50;
// const COST_HEAVY = 1000;
// const COST_MODERATE = 250;
// const COST_LIGHT = 100;

// const STARVING = 15;
// const HUNGRY = 50;

// export class SnakeLogic {

//   private _server: SocketService;

//   constructor(server: SocketService) {
//     this._server = server;
//   }

//   getFoodTravelNo(speed: number) {
//     let result;
//     if (speed <= 6) {
//       result = 5;
//     } else if (speed <= 10) {
//       result = 4;
//     } else if (speed <= 15) {
//       result = 3;
//     } else {
//       result = 2;
//     }
//     return result;
//   }

//   updateRoom(roomInfor: RoomInfor) {

//     RoomUtils.normalize(roomInfor);

//     const ourHead = roomInfor.ourPlayer.head;
//     const ourTail = roomInfor.ourPlayer.tail;

//     // 1. Sort Food by our head
//     FoodUtils.calculateValues(roomInfor.foods);
//     FoodUtils.sort(roomInfor.foods, ourHead);

//     const results = [];

//     const tailTargets = this.goodNeighbors(roomInfor, ourTail);
//     if (!PlayerUtils.isGrowing(roomInfor.ourPlayer)) tailTargets.push(ourTail);
//     for (let i = 0; i < tailTargets.length; i++) {
//       const result = this.aStarSearch(roomInfor, ourHead, [tailTargets[i]]);
//       if (result.status !== AStarStatus.success) continue;
//       if (result.path.length === 1) continue;
//       result.goal = ResultGoal.tail;
//       results.push(result);
//     }

//     // 2. Find path
//     let foodTravel = this.getFoodTravelNo(roomInfor.speed);
//     if (foodTravel > roomInfor.foods.length) foodTravel = roomInfor.foods.length;

//     for (let i = 0; i < foodTravel; i++) {
//       const food = roomInfor.foods[i];
//       const result = this.aStarSearch(roomInfor, ourHead, [food.coordinate]);
//       if (result.status !== AStarStatus.success) continue;

//       // eliminate food close to the head of a bigger enemy snake
//       if (this.enemyDistance(roomInfor, food.coordinate) < 2) continue;

//       const firstNode = result.path[1];
//       // eliminate paths we can't fit into (compute space size pessimistically)
//       if (this.getSpaceSize(roomInfor, firstNode).spaceSize < roomInfor.ourPlayer.segments.length) continue;

//       // calculate to next path:

//       const endSpzce = this.getSpaceSize(roomInfor, food.coordinate, result.path);
//       if (endSpzce.spaceSize < roomInfor.ourPlayer.segments.length) continue;
//       // result.path = endSpzce.path;

//       result.goal = ResultGoal.food;
//       results.push(result);
//     }

//     const foodDistances = [];
//     for (let i = 0; i < results.length; i++) {
//       const result = results[i];
//       const foodNode = result.path[result.path.length - 1];
//       const ourDistance = CoordinateUtils.distance(ourHead, foodNode);
//       const otherDistance = this.enemyDistance(roomInfor, foodNode);
//       foodDistances.push({
//         foodNode,
//         ourDistance,
//         enemyDistance: otherDistance,
//         advantage: otherDistance - ourDistance
//       });
//     }

//     // Sort follow: lợi thế của mình với địch
//     const foodAdvantages = foodDistances.slice().sort((a, b) => b.advantage - a.advantage);
//     // Sort follow: dài nhất tới địch
//     const foodOpportunities = foodDistances.slice().sort((a, b) => b.enemyDistance - a.enemyDistance);
//     const foodAdvantage = foodAdvantages.length && foodAdvantages[0];
//     const foodOpportunity = foodOpportunities.length && foodOpportunities[0];
//     const safeFood = results.length > 0;
//     const shouldEat = true;
//     const chaseFood = safeFood && foodAdvantage && foodAdvantage.advantage < 5;
//     // adjust the cost of paths
//     for (let i = 0; i < results.length; i++) {
//       const result = results[i];
//       const path = result.path;
//       const endNode = path[path.length - 1];

//       // heavily if end point has no path back to our tail
//       if (!this.hasPathToTail(roomInfor, endNode, roomInfor.ourPlayer)) {
//         result.cost += COST_HEAVY;
//       }

//       // heavily/moderately/lightly if not a food path and we must-eat/should-eat/chase-food
//       if (result.goal !== ResultGoal.food) {
//         if (shouldEat) {
//           result.cost += COST_MODERATE;
//         } else if (chaseFood) {
//           result.cost += COST_LIGHT;
//         }
//       }

//       // lightly if: food path, multiple food paths, not our advantage and not most available
//       if (result.goal === ResultGoal.food
//         && roomInfor.foods.length > 1
//         && foodAdvantage
//         && (CoordinateUtils.getHash(endNode) !== CoordinateUtils.getHash(foodAdvantage.foodNode) || foodAdvantage.advantage < 1)
//         && foodOpportunity
//         && CoordinateUtils.getHash(endNode) !== CoordinateUtils.getHash(foodOpportunity.foodNode)
//       ) {
//         result.cost += COST_LIGHT;
//       }
//     }
//     console.log(results);

//     // if we found paths to goals, pick cheapest one
//     if (results.length) {
//       results.sort((a, b) => {
//         return a.cost - b.cost;
//       });
//       // results.forEach(r => console.log(r.goal, r.cost, r.path.length));
//       return this.res(
//         this.getDirectionsFromPath(results[0].path) + (results[0].extendPath || ""),
//         'A* BEST PATH TO ' + results[0].goal
//       );
//     }

//     // no best moves, pick the direction that has the most open space
//     // first be pessimistic: avoid nodes next to enemy heads and spaces too small for us
//     // if that fails, be optimistic: include nodes next to enemy heads and small spaces
//     const moves = this.getSpaciousMoves(roomInfor, roomInfor.ourPlayer);
//     moves.sort((a, b) => {
//       // don't cut off escape routes
//       if (a.spaceSize === b.spaceSize) {
//         return a.wallCost - b.wallCost;
//       } else {
//         return b.spaceSize - a.spaceSize;
//       }
//     });
//     if (moves.length) {
//       return this.res(
//         this.getDirectionsFromPath([ourHead, moves[0].direction]),
//         'NO PATH TO GOAL, LARGEST SPACE'
//       );
//     }

//     // no valid moves
//     return this.res("1", 'no valid moves');
//   }

//   getSpaciousMoves(roomInfor: RoomInfor, snake: Player) {
//     const moves = [];
//     const ourHead = _.first(snake.segments);
//     const headNeighbors = this.validNeighbors(roomInfor, ourHead);

//     for (let i = 0; i < headNeighbors.length; i++) {
//       const neighbor = headNeighbors[i];
//       const spaceSize = this.getSpaceSize(roomInfor, neighbor);
//       moves.push({
//         node: neighbor,
//         direction: this.getDirectionsFromPath([ourHead, ...spaceSize.path]),
//         spaceSize: spaceSize.spaceSize,
//         wallCost: MapUtils.getWallCost(roomInfor.map, neighbor),
//         isNextMove: this.isPossibleNextMoveOfOtherSnake(roomInfor, neighbor)
//       });
//     }
//     return moves;
//   }
//   res(dirs: string, des: string) {
//     if (dirs) {
//       this._server.drive(dirs);
//       console.log(dirs);
//     }
//   }

//   getDirectionsFromPath(path: Coordinate[]) {
//     let dirs = "";
//     let last = _.first(path);
//     path.forEach(coord => {
//       dirs += CoordinateUtils.direction(last, coord) || "";
//       last = coord;
//     });
//     return dirs;
//   }

//   hasPathToTail(roomInfor: RoomInfor, startNode: Coordinate, snake: Player): any {
//     const result = this.aStarSearch(roomInfor, startNode, this.validNeighbors(roomInfor, snake.tail));
//     return result.status === AStarStatus.success;
//   }

//   getSpaceSize(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]): { spaceSize: number, path: Coordinate[] } {
//     let val = roomInfor.cachedSpaces.getValue(CoordinateUtils.getHash(node));
//     if (!val) {
//       const validNodes = [{ node, path: [...ourPath] }];
//       const seenNodes = {} as any;
//       seenNodes[CoordinateUtils.getHash(node)] = true;

//       for (let i = 0; i < validNodes.length; i++) {
//         const computingNode = validNodes[i];
//         // compute distance from current node to start node and subtract it from tails
//         // const tailTrim = CoordinateUtils.distance(node, computingNode.node);

//         const neighbors = this.validNeighbors(roomInfor, computingNode.node, computingNode.path);
//         for (let j = 0; j < neighbors.length; j++) {
//           if (!seenNodes[CoordinateUtils.getHash(neighbors[j])]) {
//             seenNodes[CoordinateUtils.getHash(neighbors[j])] = true;
//             validNodes.push({ node: neighbors[j], path: [...computingNode.path, computingNode.node] });
//           }
//         }
//       }
//       val = {
//         spaceSize: validNodes.length,
//         path: _.last(validNodes).path
//       };
//       roomInfor.cachedSpaces.setValue(CoordinateUtils.getHash(node), val);
//     }
//     return val;
//   }

//   enemyDistance(roomInfor: RoomInfor, coord: Coordinate): any {
//     return roomInfor.otherPlayers.reduce((closest, current) => {
//       return Math.min(CoordinateUtils.distance(coord, current.head), closest);
//     }, Number.MAX_SAFE_INTEGER);
//   }

//   isPossibleNextMoveOfOtherSnake(roomInfor: RoomInfor, node: Coordinate): any {
//     const filtered = roomInfor.otherPlayers.filter((player) => {
//       return CoordinateUtils.isInNodes(CoordinateUtils.neighbors(player.head), node);
//     });
//     return filtered.length > 0;
//   }

//   isNodeInSnake(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]): any {
//     for (let i = 0; i < roomInfor.otherPlayers.length; i++) {
//       if (CoordinateUtils.isInNodes(roomInfor.otherPlayers[i].segments, node, ourPath.length)) {
//         return true;
//       }
//     }
//     if (CoordinateUtils.isInNodes(roomInfor.ourPlayer.segments, node, ourPath.length)) {
//       return true;
//     } else {
//       const start = ourPath.length - roomInfor.ourPlayer.segments.length || 0;
//       for (let index = start; index < ourPath.length; index++) {
//         if (CoordinateUtils.isSame(ourPath[index], node)) {
//           return true;
//         }
//       }
//     }
//     return false;
//   }

//   goodNeighbors(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]) {
//     return this.validNeighbors(roomInfor, node, ourPath).filter((n) => {
//       // don't consider nodes adjacent to the head of another snake
//       return !this.isPossibleNextMoveOfOtherSnake(roomInfor, n);
//     });
//   }

//   validNeighbors(roomInfor: RoomInfor, node: Coordinate, ourPath?: Coordinate[]) {
//     return CoordinateUtils.neighbors(node).filter((nb) => {
//       // walls are not valid
//       if (MapUtils.isWall(roomInfor.map, nb)) return false;

//       // don't consider occupied nodes unless they are moving tails
//       if (this.isNodeInSnake(roomInfor, nb, ourPath) && !this.isMovingTail(roomInfor, nb)) return false;

//       // custom wall!!! return false;

//       // looks valid
//       return true;
//     });
//   }

//   isMovingTail(roomInfor: RoomInfor, node: Coordinate): any {
//     for (let i = 0; i < roomInfor.players.length; i++) {
//       const body = roomInfor.players[i].segments;

//       // if it's not the tail node, consider next snake
//       if (!CoordinateUtils.isSame(node, body[body.length - 1])) continue;

//       // if snake is growing, tail won't move
//       if (PlayerUtils.isGrowing(roomInfor.players[i])) return false;

//       // must be a moving tail
//       return true;
//     }
//     return false;
//   }

//   //#region A-START search
//   private aStarSearch(roomInfor: RoomInfor, start: Coordinate, targets: Coordinate[]): AStarResult {
//     const options = {
//       start: start,
//       isEnd: (node: Coordinate) => CoordinateUtils.isInNodes(targets, node),
//       neighbor: (node: Coordinate, path: Coordinate[]) => this.goodNeighbors(roomInfor, node, path),
//       distance: CoordinateUtils.distance,
//       heuristic: (node) => this.heuristic(roomInfor, node),
//       hash: CoordinateUtils.getHash,
//       timeout: SEARCH_TIMEOUT
//     };
//     return aStar(options);
//   }

//   heuristic(roomInfor: RoomInfor, node: Coordinate) {
//     // cost goes up if node is close to a wall because that limits escape routes
//     let cost = MapUtils.getWallCost(roomInfor.map, node);

//     // cost goes up if node is close to another snake
//     cost += this.getProximityToSnakes(roomInfor, node);

//     return cost;
//   }

//   getProximityToSnakes(roomInfor: RoomInfor, node: Coordinate): any {
//     let proximity = 0;
//     const quarterBoard = Math.min(roomInfor.map.vertical, roomInfor.map.horizontal) / 4;
//     for (let i = 0; i < roomInfor.players.length; i++) {
//       const player = roomInfor.players[i];
//       if (PlayerUtils.isOurPlayer(player)) continue;

//       const gap = CoordinateUtils.distance(player.head, node);

//       // insignificant proximity if > 1/4 of the board away
//       if (gap >= quarterBoard) continue;

//       proximity += (quarterBoard - gap) * 10;
//     }
//     return proximity;
//   }
//   //#endregion
// }
