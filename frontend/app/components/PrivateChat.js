'use client';

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './PrivateChat.css';

const PrivateChat = ({ currentUserId, otherUserId, otherUserName, otherUserEmail, onRead }) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch message history + mark as read
  useEffect(() => {
    const token = sessionStorage.getItem('token');
    setLoading(true);

    fetch(`http://localhost:5000/api/messages/${otherUserId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setMessages(data);
        setLoading(false);
        // Mark as read
        fetch(`http://localhost:5000/api/messages/${otherUserId}/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(() => onRead && onRead(otherUserId));
      })
      .catch(err => {
        console.error('Error loading messages:', err);
        setLoading(false);
      });
  }, [otherUserId]);

  // Socket.io connection
  useEffect(() => {
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket']
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Connected to chat');
      setConnected(true);

      // Join private room
      newSocket.emit('join_private_room', {
        userId: currentUserId,
        otherUserId: otherUserId
      });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected');
      setConnected(false);
    });

    // Receive new message
    newSocket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      if (msg.sender_id !== currentUserId) {
        const token = sessionStorage.getItem('token');
        fetch(`http://localhost:5000/api/messages/${msg.sender_id}/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(() => onRead && onRead(msg.sender_id));
      }
    });

    // Error
    newSocket.on('message_error', (error) => {
      alert('Error: ' + error);
    });

    return () => {
      newSocket.close();
    };
  }, [currentUserId, otherUserId]);

  // Send message
  const sendMessage = (e) => {
    e.preventDefault();

    if (!input.trim() || !socket || !connected) return;

    socket.emit('send_private_message', {
      senderId: currentUserId,
      recipientId: otherUserId,
      content: input.trim()
    });
    
    setInput('');
  };

  return (
    <div className="private-chat">
      <div className="chat-header">
        <div className="user-info">
        <h3>💬 {otherUserName} </h3>
        <p className="user-email">{otherUserEmail}</p>
        </div>
      </div>

      <div className="messages">
        {loading ? (
          <p className="loading-messages">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="no-messages">No messages yet. Say hi! 👋</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.sender_id === currentUserId ? 'sent' : 'received'}`}
            >
              <div className="message-content">{msg.content}</div>
              <div className="message-time">
                {new Date(msg.sent_at).toLocaleString('el-GR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={!connected}
        />
        <button type="submit" disabled={!connected || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default PrivateChat;