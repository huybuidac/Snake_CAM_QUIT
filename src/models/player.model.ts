import { Direction } from "./direction.enum";

export interface Player {
  direction?: Direction;
  name?: string;
  score?: number;
  segments?: { x: number, y: number }[];
}
