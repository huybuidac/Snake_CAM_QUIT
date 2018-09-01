import { Injectable } from '@angular/core';
import * as socketIo from 'socket.io-client';
import { Socket } from 'socket.io';

const ClientConfig = {
  PLAYER: {
    OUTGOING: {
      JOIN_ROOM: 'player join room',
      DRIVE_ELEPHANT: 'player drive elephant',
    },
    INCOMMING: {
      ROOM_STATE: 'player room state',
      DRIVE_ELEPHANT_STATE: 'player drive elephant state',
    },
  }
};

const AppConfig = {
  API_CODE: {
    UN_KNOWN: 0,
    SUCCESS: 1,
    NOT_EXISTED_ROOM: 100,
    INVALID_KEY: 101,
    SYSTEM_ERROR: 102,
    INVALID_PARAMETER: 103,
  }
};

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  public isConnected;

  private _socket: Socket;
  private _tid: string;
  private _mid: string;

  constructor() { }

  connect(serverUrl: string) {
    if (!this._socket) {
      this._socket = socketIo(serverUrl);
      this.isConnected = true;
      this.setupConnection();
    } else {
      console.error("Server was already connected!!!");
    }
  }

  registerRoom(tid: string, mid: string) {
    if (this._socket) {
      this._tid = tid;
      this._mid = mid;
      this._socket.emit(ClientConfig.PLAYER.OUTGOING.JOIN_ROOM, tid, mid);
    } else {
      console.log("Please connect server before register room");
    }
  }

  drive(directions: string) {
    if (this._socket) {
      this._socket.emit(ClientConfig.PLAYER.OUTGOING.DRIVE_ELEPHANT, this._tid, this._mid, directions);
    } else {
      console.log("Please connect server before drive");
    }
  }

  disconnect() {
    if (this._socket) {
      this._socket.disconnect();
      this.isConnected = false;
    } else {
      console.error("Server was already disconnected!!!");
    }
    this._socket = null;
  }

  setupConnection(): any {
    this._socket.on(ClientConfig.PLAYER.INCOMMING.ROOM_STATE, function (res) {
      console.log('ROOM_STATE', res);
      switch (res.code) {
        case AppConfig.API_CODE.SUCCESS:
          // TODO: Implepment your solution.
          break;

        default:
          // Other responding code of API: NOT_EXISTED_ROOM, INVALID_KEY, SYSTEM_ERROR, INVALID_PARAMETER, UN_KNOWN
          break;
      }

    });

    this._socket.on(ClientConfig.PLAYER.INCOMMING.DRIVE_ELEPHANT_STATE, function (res) {
      console.log('DRIVE_ELEPHANT_STATE', res);
    });
  }
}
