import { SocketService } from './socket.service';
export class SnakeLogic {

  private _server;

  constructor(server: SocketService) {
    this._server = server;
  }
}
