import { environment } from '../environments/environment';
import { SocketService } from './socket.service';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Direction } from '../models/direction.enum';

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

  constructor(
    public socketService: SocketService
  ) {

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
