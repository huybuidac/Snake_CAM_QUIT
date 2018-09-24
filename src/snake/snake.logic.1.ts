import { AStarResult, AStarStatus, ResultGoal } from './../app/a-star';
import { Direction } from './../models/direction.enum';
import { Coordinate, CoordinateUtils } from './../models/coordinate.model';
import { RoomInfor } from '../models/roomInfo.model';
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

const STARVING = 15;
const HUNGRY = 50;

export class SnakeLogicx {

  private _server: SocketService;
  private _ourSnake: Player;
  private _otherSnakes: Player[];
  private _roomInfo: RoomInfor;

  private _spaceCached = new Dictionary<string, { spaceSize: number, path: Coordinate[] }>();

  constructor(server: SocketService) {
    this._server = server;
  }

  count = 0;

  updateRoom(roomInfor: RoomInfor) {
    const index = this.count++;
    this._roomInfo = roomInfor;
    this._spaceCached = new Dictionary<string, { spaceSize: number, path: Coordinate[] }>();

    this._ourSnake = PlayerUtils.getOurPlayer(this._roomInfo.players);
    this._otherSnakes = PlayerUtils.getOtherPlayers(this._roomInfo.players);
    const head = _.first(this._ourSnake.segments);
    const tail = _.last(this._ourSnake.segments);

    let result: AStarResult;
    let results = [];

    // compute paths to food
    const foodPaths = [] as AStarResult[];

    // 1. Normalize and Sort Foods
    FoodUtils.calculateValues(this._roomInfo.foods);
    FoodUtils.sort(this._roomInfo.foods, head);

    for (let i = 0; i < 5; i++) {
      result = this.aStarSearch(head, [this._roomInfo.foods[i].coordinate]);
      if (result.status !== AStarStatus.success) continue;
      result.goal = ResultGoal.food;
      foodPaths.push(result);
    }

    // eliminate unsafe food paths
    results = foodPaths.filter((fPath) => {

      const firstNode = fPath.path[1];
      const endNode = fPath.path[fPath.path.length - 1];

      // eliminate food close to the head of a bigger enemy snake
      if (this.enemyDistance(endNode) < 3) return false;

      // eliminate paths we can't fit into (compute space size pessimistically)
      if (this.getSpaceSize(firstNode).spaceSize < this._ourSnake.segments.length) return false;

      // const endSpzce = this.getSpaceSize(endNode, fPath.path.length - 1);
      // if (endSpzce.spaceSize < this._ourSnake.segments.length) return false;
      // fPath.extendPath = this.getDirectionsFromPath(endSpzce.path);
      return true;
    });

    // we want to the be closest snake to at least one piece of food
    // determine how close we are vs. how close our enemies are
    const foodDistances = [];
    for (let i = 0; i < results.length; i++) {
      result = results[i];
      const foodNode = result.path[result.path.length - 1];
      const ourDistance = CoordinateUtils.distance(head, foodNode);
      const otherDistance = this.enemyDistance(foodNode);
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

    const safeFood = results.length > 0;
    const shouldEat = true;
    const chaseFood = safeFood && foodAdvantage && foodAdvantage.advantage < 5;

    // if eating is optional, seek tail nodes
    const tailTargets = this.goodNeighbors(tail);
    if (!PlayerUtils.isGrowing(this._ourSnake)) tailTargets.push(tail);
    for (let i = 0; i < tailTargets.length; i++) {
      result = this.aStarSearch(head, [tailTargets[i]]);
      if (result.status !== AStarStatus.success) continue;
      if (result.path.length === 1) continue;
      result.goal = ResultGoal.tail;
      results.push(result);
    }

    // adjust the cost of paths
    for (let i = 0; i < results.length; i++) {
      result = results[i];
      const path = result.path;
      const endNode = path[path.length - 1];

      // heavily if end point has no path back to our tail
      if (!this.hasPathToTail(endNode, this._ourSnake)) {
        result.cost += COST_HEAVY;
      }

      // heavily/moderately/lightly if not a food path and we must-eat/should-eat/chase-food
      if (result.goal !== ResultGoal.food) {
        if (shouldEat) {
          result.cost += COST_MODERATE;
        } else if (chaseFood) {
          result.cost += COST_LIGHT;
        }
      }

      // lightly if: food path, multiple food paths, not our advantage and not most available
      if (result.goal === ResultGoal.food
        && this._roomInfo.foods.length > 1
        && foodAdvantage
        && (CoordinateUtils.getHash(endNode) !== CoordinateUtils.getHash(foodAdvantage.foodNode) || foodAdvantage.advantage < 1)
        && foodOpportunity
        && CoordinateUtils.getHash(endNode) !== CoordinateUtils.getHash(foodOpportunity.foodNode)
      ) {
        result.cost += COST_LIGHT;
      }
    }
    console.log(results);

    // if we found paths to goals, pick cheapest one
    if (results.length) {
      results.sort((a, b) => {
        return a.cost - b.cost;
      });
      // results.forEach(r => console.log(r.goal, r.cost, r.path.length));
      return this.res(
        this.getDirectionsFromPath(results[0].path) + (results[0].extendPath || ""),
        'A* BEST PATH TO ' + results[0].goal
      );
    }

    // no best moves, pick the direction that has the most open space
    // first be pessimistic: avoid nodes next to enemy heads and spaces too small for us
    // if that fails, be optimistic: include nodes next to enemy heads and small spaces
    const moves = this.getSpaciousMoves(this._ourSnake);
    moves.sort((a, b) => {
      // don't cut off escape routes
      if (a.spaceSize === b.spaceSize) {
        return a.wallCost - b.wallCost;
      } else {
        return b.spaceSize - a.spaceSize;
      }
    });
    if (moves.length) {
      console.log("END " + index);
      return this.res(
        this.getDirectionsFromPath([head, moves[0].direction]),
        'NO PATH TO GOAL, LARGEST SPACE'
      );
    }

    console.log("END " + index);
    // no valid moves
    return this.res("1", 'no valid moves');

  }

  getSpaciousMoves(snake: Player) {
    const moves = [];
    const ourHead = _.first(snake.segments);
    const headNeighbors = this.validNeighbors(ourHead);

    for (let i = 0; i < headNeighbors.length; i++) {
      const neighbor = headNeighbors[i];
      const spaceSize = this.getSpaceSize(neighbor);
      moves.push({
        node: neighbor,
        direction: this.getDirectionsFromPath([ourHead, ...spaceSize.path]),
        spaceSize: spaceSize.spaceSize,
        wallCost: MapUtils.getWallCost(this._roomInfo.map, neighbor),
        isNextMove: this.isPossibleNextMove(this._otherSnakes, neighbor)
      });
    }
    return moves;
  }

  res(dirs: string, des: string) {
    if (dirs) {
      this._server.drive(dirs);
      console.log(dirs);
    }
  }

  getDirectionsFromPath(path: Coordinate[]) {
    let dirs = "";
    let last = _.first(path);
    path.forEach(coord => {
      dirs += CoordinateUtils.direction(last, coord) || "";
      last = coord;
    });
    return dirs;
  }

  hasPathToTail(startNode: Coordinate, snake: Player): any {
    const snakeTail = _.last(snake.segments);
    const result = this.aStarSearch(startNode, this.validNeighbors(snakeTail));
    return result.status === AStarStatus.success;
  }


  getSpaceSize(node: Coordinate, tailAdd = 0): { spaceSize: number, path: Coordinate[] } {
    let val = this._spaceCached.getValue(CoordinateUtils.getHash(node));
    if (!val) {
      const path = [node];
      const validNodes = [node];
      const seenNodes = {} as any;
      seenNodes[CoordinateUtils.getHash(node)] = true;

      for (let i = 0; i < validNodes.length; i++) {
        const computingNode = validNodes[i];
        // compute distance from current node to start node and subtract it from tails
        const tailTrim = CoordinateUtils.distance(node, computingNode) + tailAdd;

        const neighbors = this.validNeighbors(computingNode, tailTrim);
        for (let j = 0; j < neighbors.length; j++) {
          if (j === 0 && path.length < 5) {
            if (_.last(path) === computingNode) {
              path.push(neighbors[j]);
            }
          }
          if (!seenNodes[CoordinateUtils.getHash(neighbors[j])]) {
            seenNodes[CoordinateUtils.getHash(neighbors[j])] = true;
            validNodes.push(neighbors[j]);
          }
        }
      }
      val = {
        spaceSize: validNodes.length,
        path
      };
      this._spaceCached.setValue(CoordinateUtils.getHash(node), val);
    }
    return val;
  }

  enemyDistance(coord: Coordinate): any {
    return this._otherSnakes.reduce((closest, current) => {
      const headNode = _.first(current.segments);
      return Math.min(CoordinateUtils.distance(coord, headNode), closest);
    }, Number.MAX_SAFE_INTEGER);
  }

  private aStarSearch(start: Coordinate, targets: Coordinate[]): AStarResult {
    const options = {
      start: start,
      isEnd: (node: Coordinate) => CoordinateUtils.isInNodes(targets, node),
      neighbor: (node: Coordinate, path: Coordinate[]) => this.goodNeighbors(node, path.length),
      distance: CoordinateUtils.distance,
      heuristic: this.heuristic.bind(this),
      hash: CoordinateUtils.getHash,
      timeout: SEARCH_TIMEOUT
    };
    return aStar(options);
  }

  heuristic(node: Coordinate) {
    // cost goes up if node is close to a wall because that limits escape routes
    let cost = MapUtils.getWallCost(this._roomInfo.map, node);

    // cost goes up if node is close to another snake
    cost += this.getProximityToSnakes(node);

    return cost;
  }

  getProximityToSnakes(node: Coordinate): any {
    let proximity = 0;
    const quarterBoard = Math.min(this._roomInfo.map.vertical, this._roomInfo.map.horizontal) / 4;
    for (let i = 0; i < this._roomInfo.players.length; i++) {
      const player = this._roomInfo.players[i];
      if (PlayerUtils.isOurPlayer(player)) continue;

      const headNode = _.first(player.segments);
      const gap = CoordinateUtils.distance(headNode, node);

      // insignificant proximity if > 1/4 of the board away
      if (gap >= quarterBoard) continue;

      proximity += (quarterBoard - gap) * 10;
    }
    return proximity;
  }

  goodNeighbors(node: Coordinate, tailTrim?: number) {
    return this.validNeighbors(node, tailTrim).filter((n) => {
      // don't consider nodes adjacent to the head of another snake
      return !this.isPossibleNextMove(this._otherSnakes, n);
    });
  }

  validNeighbors(node: Coordinate, tailTrim?: number) {
    return CoordinateUtils.neighbors(node).filter((nb) => {
      // walls are not valid
      if (MapUtils.isWall(this._roomInfo.map, nb)) return false;

      // don't consider occupied nodes unless they are moving tails
      if (this.isSnake(nb, tailTrim) && !this.isMovingTail(nb)) return false;

      // looks valid
      return true;
    });
  }

  isPossibleNextMove(players: Player[], node: Coordinate): any {
    const filtered = players.filter((player) => {
      return CoordinateUtils.isInNodes(CoordinateUtils.neighbors(_.first(player.segments)), node);
    });
    return filtered.length ? filtered[0] : false;
  }

  isMovingTail(node) {
    for (let i = 0; i < this._roomInfo.players.length; i++) {
      const body = this._roomInfo.players[i].segments;

      // if it's not the tail node, consider next snake
      if (!CoordinateUtils.isSame(node, body[body.length - 1])) continue;

      // if snake is growing, tail won't move
      if (PlayerUtils.isGrowing(this._roomInfo.players[i])) return false;

      // must be a moving tail
      return true;
    }
    return false;
  }

  isSnake(node: Coordinate, tailTrim?: number) {
    for (let i = 0; i < this._roomInfo.players.length; i++) {
      if (CoordinateUtils.isInNodes(this._roomInfo.players[i].segments, node, tailTrim)) {
        return true;
      }
    }
    return false;
  }
}
