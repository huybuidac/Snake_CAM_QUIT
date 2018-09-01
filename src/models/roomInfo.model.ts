import { Player } from './player.model';
import { MapInfo } from './map.model';
import { Food } from "./food.model";

export interface RoomInfor {
  round_status?: number;
  round_time?: number;
  speed?: number;
  foods?: Food[];
  map?: MapInfo;
  players?: Player[];
}
