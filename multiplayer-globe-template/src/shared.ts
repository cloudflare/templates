// Messages sent from server to client

export type Position = {
	lat: number;
	lng: number;
	id: string;
};

export type OutgoingMessage =
	| {
			type: "room-info";
			room: string;
	  }
	| {
			type: "add-marker";
			position: Position;
	  }
	| {
			type: "remove-marker";
			id: string;
	  }
	| {
			type: "error";
			message: string;
	  };
