# Media module

This module will own the mediasoup SFU integration.

It will create and supervise native mediasoup workers, assign rooms to workers, create routers and WebRTC transports, and manage producers and consumers. A worker pool will later use the available CPU cores without putting media work on the Node.js event loop.
