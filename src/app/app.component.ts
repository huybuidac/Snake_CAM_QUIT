import { Food } from './../models/food.model';
import { environment } from '../environments/environment';
import { SocketService } from './socket.service';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Direction } from '../models/direction.enum';
export interface Piece {
  color?: string;
  text?: string;
}

export enum SnakeColor {
  Our = 'red',
  Enemy = 'green',
  Food = 'black',
  Path = 'bisque'
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {

  title = 'SnakeCamQuit';
  serverUrl = environment.serverURL;
  tid = environment.tid;
  mid = environment.mid;

  public board: Piece[][] = [
  ];

  constructor(
    public socketService: SocketService
  ) {
    this.socketService.roomInfor$.subscribe(room => {
      if (!room) return;
      const boardBuild: Piece[][] = [];
      for (let index = 0; index < room.map.horizontal; index++) {
        const row = [] as Piece[];
        for (let indexj = 0; indexj < room.map.vertical; indexj++) {
          row.push({});
        }
        boardBuild.push(row);
      }
      let count = 0;
      boardBuild[0].forEach(element => element.text = count++ + "");
      count = 0;
      boardBuild.forEach(el => el[0].text = count++ + "");
      // RoomUtils.normalize(room);
      room.direction.dirs.forEach(node => boardBuild[node.y][node.x] = { color: SnakeColor.Path });
      room.ourPlayer.segments.forEach(seg => boardBuild[seg.y][seg.x] = { color: SnakeColor.Our });
      room.otherPlayers.forEach(p => p.segments.forEach(seg => boardBuild[seg.y][seg.x] = { color: SnakeColor.Enemy }));
      room.foods.forEach(p => boardBuild[p.coordinate.y][p.coordinate.x] = { color: SnakeColor.Food });
      boardBuild[room.ourPlayer.head.y][room.ourPlayer.head.x] = { color: 'green' };
      boardBuild[room.ourPlayer.tail.y][room.ourPlayer.tail.x] = { color: 'yellow' };
      this.board = boardBuild;
    });
  }

  dosomething(xxx) {
    console.log(xxx, this.socketService.updateMap);
  }

  handleDirectByKeyboard($event) {
    let dir = Direction.UP;
    switch ($event.code) {
      case "ArrowDown":
        dir = Direction.DOWN;
        break;
      case "ArrowLeft":
        dir = Direction.LEFT;
        break;
      case "ArrowRight":
        dir = Direction.RIGHT;
        break;
    }
    this.socketService.drive(dir);
  }

  connectServer() {
    this.socketService.connect(this.serverUrl);
    this.socketService.registerRoom(this.tid, this.mid);
  }

  disconnectServer() {
    this.socketService.disconnect();
  }

  ngOnDestroy(): void {
    this.socketService.disconnect();
  }
}
