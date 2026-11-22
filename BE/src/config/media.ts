import type { TransportListenInfo, WorkerSettings } from "mediasoup/types";

import { env } from "./env";

export type WebRtcTransportConfig = {
  listenInfos: TransportListenInfo[];
  preferUdp: boolean;
};

const webRtcTransport: WebRtcTransportConfig = {
  listenInfos: [
    {
      protocol: "udp",
      ip: env.MEDIA_LISTEN_IP,
      announcedAddress: env.MEDIA_ANNOUNCED_ADDRESS,
    },
    {
      protocol: "tcp",
      ip: env.MEDIA_LISTEN_IP,
      announcedAddress: env.MEDIA_ANNOUNCED_ADDRESS,
    },
  ],
  preferUdp: true,
};

export const mediaConfig = {
  workerCount: env.MEDIA_WORKER_COUNT,
  workerSettings: {
    logLevel: env.MEDIA_LOG_LEVEL,
  } satisfies WorkerSettings,
  webRtcTransport,
};
