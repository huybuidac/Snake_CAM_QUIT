import { Coordinate, CoordinateUtils } from "./coordinate.model";

export interface Food {
  id?: string;
  type?: string;
  coordinate?: Coordinate;
  value?: number;
}

export const FoodUtils = {
  calculateValues: (foods: Food[]) => {
    foods.forEach(f => {
      switch (f.type) {
        case "NORMAL": f.value = 1; break;
        case "SUPER": f.value = 2; break;
        case "GOLDEN": f.value = 3; break;
      }
    });
  },
  sort: (foods: Food[], node: Coordinate) => {
    foods.sort(
      (a, b) => CoordinateUtils.distance(node, a.coordinate) - CoordinateUtils.distance(node, b.coordinate));
  }
};
