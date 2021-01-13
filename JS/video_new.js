const videoRoom = {
	roomid: null,
	username: null,
	displayname: null,
	iceServers: null,
	init: function(roomid, username, displayName) {
		vr.roomid = roomid;
		vr.username = username;
		vr.displayName = displayname;

		janus["textRoom"] = new Janus({
			server: server,
			iceServers: vr.rtcIceServers,
			iceTransportPolicy: "relay",
			apisecret: boners,
			success: () => {
				janus["textRoom"].attach({
					plugin: "janus.plugin.textroom",
					opaqueId: chatId,
					success: (pluginHandle) => {
						tr.plugin = pluginHandle;
						Janus.log("Plugin attached! (" + tr.getPlugin() + ", id=" + tr.getId() + ")");

						let body = {
							request: "setup"
						};
					}
				})

			}
		});
	}
};

const vr = videoRoom;
vr.iceServers = rtcIceServers;