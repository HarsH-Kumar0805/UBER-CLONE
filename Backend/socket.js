// backend/socket.js

const socketIo = require('socket.io');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');

let io;

function initializeSocket(server) {
    // IMPROVED: Specify your frontend origin for better security in production
    io = socketIo(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173", // Use environment variable
            methods: [ 'GET', 'POST' ]
        }
    });

    io.on('connection', (socket) => {
        console.log(`✅ Client connected: ${socket.id}`);

        // Event for a user or captain to join and associate their ID with the socket
        socket.on('join', async (data) => {
            const { userId } = data;
            if (!userId) return;

            try {
                // IMPROVED: Use rooms for more flexible messaging
                socket.join(userId);
                console.log(`User ${userId} joined room and is using socket ${socket.id}`);

                // You can still save the socket ID if needed for specific use-cases
                const user = await userModel.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true });
                if (!user) {
                    await captainModel.findByIdAndUpdate(userId, { socketId: socket.id }, { new: true });
                }
            } catch (error) {
                console.error('Error during join event:', error);
                socket.emit('error', { message: 'Could not join channel.' });
            }
        });

        // Event for a captain updating their location
        socket.on('update-location-captain', async (data) => {
            const { userId, location, rideId } = data; // Assuming rideId is sent to notify the user

            if (!location || !location.ltd || !location.lng) {
                return socket.emit('error', { message: 'Invalid location data' });
            }

            try {
                await captainModel.findByIdAndUpdate(userId, {
                    'location.coordinates': [location.lng, location.ltd] // Assuming GeoJSON format [lng, lat]
                });

                // NEW: Broadcast the location update to the relevant ride room or user
                // This is the key real-time feature.
                if (rideId) {
                    io.to(rideId).emit('captain-location-updated', { captainId: userId, location });
                }

            } catch (error) {
                console.error('Error updating captain location:', error);
                socket.emit('error', { message: 'Could not update location.' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
            try {
                // NEW: Clean up the database by removing the stale socketId
                await userModel.findOneAndUpdate({ socketId: socket.id }, { socketId: null });
                await captainModel.findOneAndUpdate({ socketId: socket.id }, { socketId: null });
            } catch (error) {
                console.error('Error during socket cleanup on disconnect:', error);
            }
        });
    });
}

/**
 * Sends a message to a specific user via their user ID room.
 * @param {string} userId - The ID of the user (who is in a room named after their ID).
 * @param {string} event - The name of the event to emit.
 * @param {object} data - The payload to send.
 */
const sendMessageToUser = (userId, event, data) => {
    if (io) {
        console.log(`Emitting event '${event}' to user room '${userId}'`);
        io.to(userId).emit(event, data);
    } else {
        console.log('Socket.io not initialized.');
    }
}

// Kept your original function as well, as it's useful for direct socket targeting
const sendMessageToSocketId = (socketId, messageObject) => {
    console.log(messageObject);
    if (io) {
        io.to(socketId).emit(messageObject.event, messageObject.data);
    } else {
        console.log('Socket.io not initialized.');
    }
}

module.exports = { initializeSocket, sendMessageToSocketId, sendMessageToUser };