/* TODO
 * change userID to just use socket ID
 */

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var uuid = require('node-uuid');
var PeriodicTask = require('periodic-task');
var isEvenUsers = true;
var queue = [];

//CONSTANTS
var port = 3000;
var splitPeriod = 20 * 1000;
var gracePeriod = 3000;
var splitChanceStart = 0.5;
var probIncrement = 0.1;
var minimumFlagged = 2;

var users = []; // list of users

var splitTask = new PeriodicTask(splitPeriod, function(){
	var flaggedUsers = []; // indices of flagged users
	var d = new Date(); // time of splitTask

	for(var i = 0; i < users.length; i++){
		if(d.getTime() - users[i].timeJoined > gracePeriod){
			
			// randomize flagging
			if(Math.random() < splitChanceStart + users[i].timesMissed * probIncrement){
				flaggedUsers.push(i)
			} else {
				users[i].timesMissed = users[i].timesMissed + 1;
			}
		}
	}

	console.log(flaggedUsers);
	splitStreams(flaggedUsers);
	console.log(flaggedUsers + "*");
});

var splitStreams = function(flaggedUsers){
	var numFlagged = flaggedUsers.length;
	clearFlagged(flaggedUsers); // clear the flags

	while(numFlagged >= minimumFlagged){
		var split1 = Math.floor(Math.random() * numFlagged);
		var split2;
		while (true) {
			split2 = Math.floor(Math.random() * numFlagged);
			if (split1 != split2) {
				break;
			}
		}

		pair1a = flaggedUsers[split1];
		pair1b = findUser(users[pair1a].pairSocketID);
		pair2a = flaggedUsers[split2];
		pair2b = findUser(users[pair2a].pairSocketID);

		if (pair1a != pair2b) {
			users[pair1a].pairSocketID = users[pair2b].socket.id;
			users[pair1b].pairSocketID = users[pair2a].socket.id;
			users[pair2a].pairSocketID = users[pair1b].socket.id;
			users[pair2b].pairSocketID = users[pair1a].socket.id;
		}
		
/*
		var pair1 = findUser(users[flaggedUsers[split1]].pairSocketID);
		var pair2 = findUser(users[flaggedUsers[split2]].pairSocketID);

		if (pair1 != -1 && pair2 != -1 && 
			users[pair1].pairSocketID != users[flaggedUsers[split1]].socket.id &&
			users[pair2].pairSocketID != users[flaggedUsers[split2]].socket.id) {

			users[pair1].pairSocketID = users[flaggedUsers[split2]].socket.id;
			users[flaggedUsers[split1]].pairSocketID = users[pair2].socket.id;
			users[pair2].pairSocketID = users[flaggedUsers[split1]].socket.id;
			users[flaggedUsers[split2]].pairSocketID = users[pair1].socket.id;
		} */
		
		if (flaggedUsers[split1] > flaggedUsers[split2]) {
			flaggedUsers.splice(split1, 1);
			flaggedUsers.splice(split2, 1);
		} else {
			flaggedUsers.splice(split2, 1);
			flaggedUsers.splice(split1, 1);
		}

		numFlagged -= 2;
	}

}

var findUser = function(socketID){
	for (var i = 0; i < users.length; i++) {
		if (users[i].socket.id == socketID) {
			return i;
		}
	}
	return -1;
}

var clearFlagged = function(flaggedUsers){
	for(var i = 0; i < flaggedUsers.length; i++){
		users[flaggedUsers[i]].timesMissed = 0;
	}
}

var removeUser = function(userID){
	for(var i = 0; i < users.length; i++){
		if(users[i].userID == userID){
			users.splice(i, 1);
			console.log('User removed');
			return;
		}
	}

	console.log('Unable to remove user');
}

var addToQueue = function(user){
	if(!isEvenUsers){
		// if number of users is odd, push to queue
		queue.push(user);
		console.log('A');
	} else {
		// assign each user the other's socket ID
		user.pairSocketID = queue[0].socket.id;
		queue[0].pairSocketID = user.socket.id;

		// push user on the queue
		users.push(queue.pop());
		console.log('B');
		// add user to list
		users.push(user);
	}
}

app.get('/', function(req, res){
	res.sendfile('index.html');
});

io.on('connection', function(socket){
	var userID = uuid.v1(); // generate user ID
	var d = new Date(); // time user joins

	// create user object
	var user = {
		socket: socket, // this user's socket
		userID: userID, // this user's generated ID
		pairSocketID: 0, // socket ID of partner (will be changed)
		timeJoined: d.getTime(), // when this user joined
		timesMissed: 0 // number of times the split missed
	};

	// update if number of users is even or not
	isEvenUsers = !isEvenUsers;
	addToQueue(user);

	/*if(!isEvenUsers){
		// if number of users is odd, push to queue
		queue.push(user);	
	} else {
		// assign each user the other's socket ID
		user.pairSocketID = queue[0].socket.id;
		queue[0].pairSocketID = user.socket.id;

		// push user on the queue
		users.push(queue.pop());
		// add user to list
		users.push(user);
	} */

	console.log('A user is now crossing streams');
	
	socket.on('disconnect', function(){
		isEvenUsers = !isEvenUsers;

		// move user's former partner to the queue
		for(var i = 0; i < users.length; i++){
			if(user.pairSocketID == users[i].socket.id){
				users[i].pairSocketID = 0;
				addToQueue(users[i]);
				users.splice(i, 1);
				break;
			}
		}

		removeUser(userID); // remove the user
		console.log('User has been relieved');
	});

	socket.on('chat message', function(msg){
		console.log('stream: ' + msg);
		
		if(user.pairSocketID != 0 && io.sockets.connected != null){
			io.sockets.connected[user.pairSocketID].emit('their message', msg);
			io.sockets.connected[user.socket.id].emit('my message', msg);
		} else {
			io.sockets.connected[user.socket.id].emit('chat message', 'We\'re all out of users! Please wait for more to connect.');
		}

		console.log(users); // print user
	});
});

http.listen(port, function(){
	console.log('listening on *:' + port); 
});

splitTask.run();