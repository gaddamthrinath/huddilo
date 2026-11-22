# Realtime module

This module will own the Socket.IO server and signaling events. It carries control messages only: joining a room, waiting-room updates, mute state, host actions, and WebRTC transport negotiation.

It must never carry audio or video media packets. Media flows directly between the browser and the SFU.
