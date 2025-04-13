import pkg from "@slack/bolt";
import { configDotenv } from "dotenv";
import {
  approveRequest,
  getRequtest,
  rejectRequest,
  sayHello,
  sendApprovalRequest,
} from "./SlashCommand/slashCommand.js";

configDotenv();
const { App } = pkg;
const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// listens

app.command("/hello", sayHello);

// comand to send apporval
app.command("/approval-test", sendApprovalRequest);


// get the approval
app.view("user_select_modal", getRequtest);

// approve the request
app.action("request_approve_button", approveRequest);

// reject the request
app.action("request_rejetced_button", rejectRequest);


(async () => {
  // Start the app
  await app.start(process.env.PORT || 3000);

  console.log(`⚡️ Bolt app is running on ${process.env.PORT} || 3000`);
})();
