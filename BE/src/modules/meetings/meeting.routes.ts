import { Router, type Router as ExpressRouter } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import type { MeetingController } from "./meeting.controller";

export class MeetingRoutes {
  public readonly router: ExpressRouter;

  public constructor(private readonly meetingController: MeetingController) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.post("/", asyncHandler(this.meetingController.create));
    this.router.post("/:meetingCode/host-session",asyncHandler(this.meetingController.createHostSession),);
    this.router.get("/:meetingCode/host-access",asyncHandler(this.meetingController.getHostAccess),);
    this.router.get("/:meetingCode/guest-session", this.meetingController.getGuestSession);
    this.router.post("/:meetingCode/guest-session", asyncHandler(this.meetingController.createGuestSession));
    this.router.get("/:meetingCode",asyncHandler(this.meetingController.getByCode),);
  }
}
