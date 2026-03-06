import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || undefined;

export function createReadingClubSocket() {
  return io(API_BASE, {
    transports: ['websocket'],
    autoConnect: true
  });
}
