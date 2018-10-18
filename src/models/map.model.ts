import { Coordinate, CoordinateUtils } from './coordinate.model';
export interface MapInfo {
  horizontal?: number;
  vertical?: number;
}

export const MapUtils = {
  isWall: (map: MapInfo, coord: Coordinate, wall?: Coordinate[]) => {
    return coord.x <= 0 || coord.x >= map.horizontal || coord.y <= 0 || coord.y >= map.vertical
    || (wall && CoordinateUtils.isInNodes(wall, coord));
  },
  isNearWall: (map: MapInfo, coord: Coordinate) => coord.x <= 1 || coord.x >= map.horizontal - 1
    || coord.y <= 1 || coord.y >= map.vertical - 1,
  getWallCost: (map: MapInfo, coord: Coordinate) => {
    const halfWidth = map.horizontal / 2;
    const halfHeight = map.vertical / 2;
    const deviation = [
      Math.abs(coord.x - halfWidth) / halfWidth,
      Math.abs(coord.y - halfHeight) / halfHeight
    ];

    return Math.round(Math.max(...deviation) * ((halfWidth + halfHeight) / 4));
  }
};
