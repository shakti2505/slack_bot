const messageStore = new Map(); // Globally defined somewhere

export const sayHello = async ({ command, ack, say }) => {
  await ack();
  await say(`Hello, <@${command.user_id}>`);
};

// send approaval request
export const sendApprovalRequest = async ({ ack, body, client, logger }) => {
  await ack();

  try {
    // call view.open with built in client
    await client.views.open({ 
      // pass a valid triggered_id within 3 seconds of receiving it

      trigger_id: body.trigger_id,

      // view payload
      view: {
        type: "modal",
        // view identifire
        callback_id: "user_select_modal",
        title: {
          type: "plain_text",
          text: "New Approval Request",
        },
        blocks: [
          {
            type: "input",
            block_id: "user_block",
            label: {
              type: "plain_text",
              text: "Approver",
            },
            element: {
              type: "users_select",
              action_id: "selected_user",
              placeholder: {
                type: "plain_text",
                text: "Who needs to sign off on this?",
              },
            },
          },
          {
            type: "input",
            block_id: "input_c",
            label: {
              type: "plain_text",
              text: "Description?",
            },
            element: {
              type: "plain_text_input",
              action_id: "request_input",
              placeholder: {
                type: "plain_text",
                text: "I need to get approval for...",
              },
              multiline: true,
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Get Approval",
        },
      },
    });
  } catch (error) {
    logger.info(error);
  }
};

// get request 
export const getRequtest = async ({ ack, view, body, client }) => {
  // acknowledge
  await ack();  
  try {
    // extracting selected user id and the request content
    const selectedUserId =
      view.state.values.user_block.selected_user.selected_user;
    const requtes_content = view.state.values.input_c.request_input.value;

    // Open a DM channel with the selected user
    const approverDm = await client.conversations.open({
      users: selectedUserId,
    });
    const requesterDm = await client.conversations.open({
      users: body.user.id,
    });
    const approverChannelId = approverDm.channel.id;
    const requesterChannelId = requesterDm.channel.id;

    // Send message in the DM
    await client.chat.postMessage({
      channel: approverChannelId,
      text: `Hey <@${selectedUserId}>, <@${body.user.id}> sent you a message: "${requtes_content}"`, // fallback text
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Hey <@${selectedUserId}>, <@${body.user.id}> sent you a message:\n*${requtes_content}*`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Approve",
                emoji: true, // optional but helps
              },
              style: "primary", // use "primary" instead of "success"
              action_id: "request_approve_button",
              value: JSON.stringify({
                requesterId: body.user.id,
                message: requtes_content,
              }),
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Reject",
                emoji: true,
              },
              style: "danger",
              action_id: "request_rejetced_button",
              value: JSON.stringify({
                requesterId: body.user.id,
                message: requtes_content,
              }),
            },
          ],
        },
      ],
    });

    // sending message with request status to the requester
    const messageToRequester = await client.chat.postMessage({
      channel: requesterChannelId,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "👋 Here is a summary of your approval request:",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: "*Status:* Pending ⌛",
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Description:* \n${requtes_content}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Pending by:* \n<@${selectedUserId}>`,
          },
        },
      ],
    });

    // storing message channel and timestamp to later update the messgage once request get approved/ reject
    messageStore.set(body.user.id, {
      channel: messageToRequester.channel,
      ts: messageToRequester.ts,
    });

    // additinal modal opens in the view of requester for better UI experience
    await client.views.open({
      trigger_id: body.trigger_id,

      view: {
        type: "modal",
        title: {
          type: "plain_text",
          text: "Good to GO!",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `That's a wrap, <@${body.user.id}>! I've sent the request to the approvar.\n I will let you know as soon as I hear something!`,
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("Error sending DM:", error);
  }
};

// approve request 
export const approveRequest = async ({ ack, body, client }) => {
  await ack();

  // get the requester ID and message
  const payload = JSON.parse(body.actions[0].value);
  const { requesterId, message } = payload;

  // notify approver
  await client.chat.postMessage({
    channel: body.user.id,
    text: `You approve the request raised by <@${requesterId}>!`,
  });

  // notify requester
  await client.chat.postMessage({
    channel: requesterId,
    text: `✅ Your request: "${message}" was *approved* by <@${body.user.id}>`,
  });

  // once request is approved removed the buttons and update the original message from approver's DM
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: `Request Approved✅: "${message}" raised by ${requesterId} `, // Fallback text

    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Request Approved  ✅*\n*Description :*\n"${message}"\n\n *Raised by:*\n\ <@${requesterId}>\n\n *Approved by*:\n <@${body.user.id}>`,
        },
      },
    ],
  });

  // update the request status for the request from pending to approved
  const { channel, ts } = messageStore.get(requesterId); // timestamp and channel of the messasge send to request with initial status to update, when request gets approved
  await client.chat.update({
    channel: channel,
    ts: ts,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "👋 Here is a summary of your approval request:",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*Status:* Approved ✅",
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:* \n${message}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Approved by:* \n<@${body.user.id}>`,
        },
      },
    ],
  });
};

// reject request
export const rejectRequest = async ({ ack, body, client }) => {
  await ack();

  // get the requester ID and message
  const payload = JSON.parse(body.actions[0].value);
  const { requesterId, message } = payload;

  // notify approver
  await client.chat.postMessage({
    channel: body.user.id,
    text: `You Rejected the request of  <@${requesterId}>!`,
  });

  // notify requester
  await client.chat.postMessage({
    channel: requesterId,
    text: `✅ Your request: "${message}" was *Rejected* by <@${body.user.id}>`,
  });

  // Update the original message once request is rejected
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: `Request rejected ❌: "${message}" raised by ${requesterId} `, // Fallback text
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Request Rejected ❌*\n*Description :*\n"${message}"\n\n *Raised by:*\n <@${requesterId}>\n\n *Rejected by*:\n <@${body.user.id}> `,
        },
      },
    ],
  });
  // update the request status for the request from pending to Rejected
  const { channel, ts } = messageStore.get(requesterId); // timestamp and channel of the messasge send to request with initial status to update it when request gets Rejected
  await client.chat.update({
    channel: channel,
    ts: ts,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "👋 Here is a summary of your approval request:",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*Status:* Rejected ❌",
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:* \n${message}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Rejected by:* \n<@${body.user.id}>`,
        },
      },
    ],
  });
};
