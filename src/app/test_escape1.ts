import { MapInfo } from '../models/map.model';
import { RoomInfor } from '../models/roomInfo.model';

export const test_escape1: RoomInfor = {
  players: [
    {
      name: "CAM_QUIT",
      segments: [
        {
          x: 1,
          y: 2
        },
        {
          x: 1,
          y: 3
        },
        {
          x: 2,
          y: 3
        },
        {
          x: 3,
          y: 3
        },
        {
          x: 4,
          y: 3
        },
        {
          x: 5,
          y: 3
        },
        {
          x: 6,
          y: 3
        },
        {
          x: 7,
          y: 3
        },
        {
          x: 7,
          y: 2
        },
        {
          x: 7,
          y: 1
        },
        {
          x: 8,
          y: 1
        },
        {
          x: 9,
          y: 1
        },
        {
          x: 10,
          y: 1
        },
        {
          x: 10,
          y: 2
        },
        {
          x: 10,
          y: 3
        },
        {
          x: 10,
          y: 4
        }
      ],
      score: 15
    }
  ],
  map: {
    horizontal: 24,
    vertical: 24
  },
  foods: [
    {
      coordinate: {x: 23, y: 23},
      value: 1
    }
  ]
};
