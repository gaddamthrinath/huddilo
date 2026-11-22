export type Meeting = {
  code: string;
  passcode: string;
  url: string;
  hostUrl: string;
  createdAt: string;
};

export type PublicMeeting = {
  code: string;
  url: string;
  status: "active";
  createdAt: string;
};
