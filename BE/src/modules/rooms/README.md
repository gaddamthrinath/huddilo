# Rooms module

This module will own in-memory meeting-room state: participants, host presence, waiting-room requests, and admission decisions.

MongoDB remains the source of truth for persistent meeting data. This module will hold only live call state and will coordinate with the realtime and media modules.
