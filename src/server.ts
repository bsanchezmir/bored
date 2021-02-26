import WebSocket, { Server } from "ws";
import { IncomingMessage, ServerResponse, createServer, Server as HttpServer } from "http";
import { LensAgent } from "./lens-agent";
import { Socket } from "net";
import { URL } from "url";
import { version } from "../package.json";

export class TunnelServer {
  private server?: HttpServer;
  private ws?: Server;
  private agents: LensAgent[] = [];

  start(port = 8080) {
    console.log(`~~ BoreD v${version} ~~`);

    this.ws = new Server({
      noServer: true
    });

    this.server = createServer(this.handleRequest.bind(this));
    this.server.on("upgrade", this.handleUpgrade.bind(this));
    this.server.on("listening", () => {
      console.log(`SERVER: listening on port ${port}`);
    });

    this.server.listen(port);
  }

  stop() {
    console.log("SERVER: shutting down");
    this.server?.close();
  }

  handleRequest(req: IncomingMessage, res: ServerResponse) {
    if (!req.url) return;

    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/healthz") {
      res.writeHead(200);
      res.end();

      return;
    }

    res.writeHead(404);
    res.end();
  }

  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    if (!req.url || !req.method) {
      socket.end();

      return;
    }

    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/agent/connect") {
      this.ws?.handleUpgrade(req, socket, head, (socket: WebSocket) => {
        this.handleAgentSocket(req, socket);
      });
    } else if (url.pathname === "/client/connect") {
      this.ws?.handleUpgrade(req, socket, head, this.handleClientSocket.bind(this));
    }
  }

  handleAgentSocket(req: IncomingMessage, socket: WebSocket) {
    console.log("SERVER: agent connected");
    const agent = new LensAgent(socket, req.headers["X-BoreD-PublicKey"]?.toString() || "");

    this.agents.push(agent);

    socket.on("close", () => {
      console.log("SERVER: agent disconnected");
      const index = this.agents.findIndex((agent) => agent.socket === socket);

      if (index !== -1) {
        this.agents.splice(index, 1);
      }
    });
  }

  handleClientSocket(socket: WebSocket) {
    console.log("SERVER: client connected");
    const agent = this.agents[Math.floor(Math.random() * this.agents.length)];

    if (!agent) {
      console.log("SERVER: no agents online, closing client request");
      socket.close();

      return;
    }

    const stream = agent.openStream();
    const duplex = WebSocket.createWebSocketStream(socket);

    duplex.pipe(stream).pipe(duplex);
  }
}
