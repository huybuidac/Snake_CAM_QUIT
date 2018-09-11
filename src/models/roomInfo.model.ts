import { Player, PlayerUtils } from './player.model';
import { MapInfo } from './map.model';
import { Food } from "./food.model";
import * as _ from 'lodash';
import { Dictionary } from 'typescript-collections';
import { Coordinate } from './coordinate.model';

export interface RoomInfor {
  round_status?: number;
  round_time?: number;
  speed?: number;
  foods?: Food[];
  map?: MapInfo;
  players?: Player[];
  ourPlayer?: Player;
  otherPlayers?: Player[];
  cachedSpaces: Dictionary<string, { spaceSize: number, path: Coordinate[] }>;
}

export const RoomUtils = {
  normalize: (roomInfor: RoomInfor) => {
    roomInfor.cachedSpaces = new Dictionary();
    roomInfor.ourPlayer = PlayerUtils.getOurPlayer(roomInfor.players);
    roomInfor.players.forEach(p => {
      p.originalLength = p.segments.length;
      if (p.segments.length - 1 < p.score) {
        const tail = _.last(p.segments);
        const lst = Array(p.score + 1 - p.segments.length).fill({ ...tail });
        p.segments = p.segments.concat(lst);
      }
    });
    roomInfor.otherPlayers = PlayerUtils.getOtherPlayers(roomInfor.players);
    roomInfor.players.forEach(p => {
      p.head = _.first(p.segments);
      p.tail = _.last(p.segments);
    });
  }
};
