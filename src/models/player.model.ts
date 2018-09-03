import { environment } from 'src/environments/environment';
import { Direction } from "./direction.enum";
import { Coordinate, CoordinateUtils } from "./coordinate.model";

export interface Player {
  direction?: Direction;
  name?: string;
  score?: number;
  segments?: Coordinate[];
}

export const PlayerUtils = {
  isGrowing: (player: Player) => {
    const segments = player.segments;
    const lenght = segments.length;
    return lenght > 1 && CoordinateUtils.isSame(segments[lenght - 1], segments[lenght - 2]);
  },
  containSegment: (player: Player, segment: Coordinate, tailTrim: number) => {
    tailTrim = tailTrim > 0 ? tailTrim : 0;
    for (let i = 0; i < (player.segments.length - tailTrim); i++) {
      if (segment.x === player.segments[i].x && segment.y === player.segments[i].y) return true;
    }
    return false;
  },
  isOurPlayer: (player: Player) => player.name === environment.snake_name,
  getOurPlayer: (players: Player[]) => players.find(p => PlayerUtils.isOurPlayer(p)),
  getOtherPlayers: (players: Player[]) => players.filter(p => !PlayerUtils.isOurPlayer(p)),
};
