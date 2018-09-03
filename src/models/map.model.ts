import { Coordinate } from './coordinate.model';
export interface MapInfo {
  horizontal?: number;
  vertical?: number;
}

export const MapUtils = {
  isWall: (map: MapInfo, coord: Coordinate) => coord.x <= 0 || coord.x >= map.horizontal || coord.y <= 0 || coord.y >= map.vertical,
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
