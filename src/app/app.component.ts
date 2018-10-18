import { Food } from './../models/food.model';
import { environment } from '../environments/environment';
import { SocketService } from './socket.service';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Direction } from '../models/direction.enum';
import { BehaviorSubject } from 'rxjs';
import { mergeMap, map, tap, switchMap } from 'rxjs/operators';
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
interface sub1 {
  a: number;
}
interface sub2 {
  b: number;
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
  subNum1 = 0;
  subNum2 = 0;
  sub1 = new BehaviorSubject<sub1>(null);
  sub2 = new BehaviorSubject<sub2>(null);

  // sub = this.sub1.pipe(
  //   mergeMap(_ => this.sub2, (a, b) => {...a, ...b})
  // )

  loading = this.sub1.pipe(
    switchMap(_ => this.sub2.pipe(
      map(val => ({ ..._, ...val }))
    )),
    tap(val => console.log("tap loading", val))
  );

  x = this.loading.subscribe(
    val => console.log("loading", val)
  );

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
      try {
        room.direction.dirs.forEach(node => boardBuild[node.y][node.x] = { color: SnakeColor.Path });
        room.ourPlayer.segments.forEach(seg => boardBuild[seg.y][seg.x] = { color: SnakeColor.Our });
        room.otherPlayers.forEach(p => p.segments.forEach(seg => boardBuild[seg.y][seg.x] = { color: SnakeColor.Enemy }));
        room.foods.forEach(p => boardBuild[p.coordinate.y][p.coordinate.x] = { color: SnakeColor.Food });
        boardBuild[room.ourPlayer.head.y][room.ourPlayer.head.x] = { color: 'green' };
        boardBuild[room.ourPlayer.tail.y][room.ourPlayer.tail.x] = { color: 'yellow' };
        this.board = boardBuild;
      } catch(err) {
        console.error(err);
      }
    });
  }

  dosomething() {
    // console.log(xxx, this.socketService.updateMap);
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
    // this.sub1.next({ a: ++this.subNum1 });
    this.socketService.connect(this.serverUrl);
    this.socketService.registerRoom(this.tid, this.mid);
  }

  test() {
    // this.sub2.next({ b: ++this.subNum2 });
    this.socketService.test();
  }

  disconnectServer() {
    this.sub2.next({ b: ++this.subNum2 });
    this.socketService.disconnect();
  }

  ngOnDestroy(): void {
    this.socketService.disconnect();
  }
}
