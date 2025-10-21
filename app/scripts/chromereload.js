/**
 * Development hot-reload client for Chrome Extensions
 * Compatible with livereload servers
 * WARNING: Only supports reload command - remove for production builds
 */

const LIVERELOAD_HOST = 'localhost';
const LIVERELOAD_PORT = 35729;

try {
  const connection = new WebSocket(`ws://${LIVERELOAD_HOST}:${LIVERELOAD_PORT}/livereload`);

  connection.onerror = (error) => {
    console.log('Reload connection error:', error);
  };

  connection.onmessage = (event) => {
    if (event.data) {
      try {
        const data = JSON.parse(event.data);
        if (data?.command === 'reload') {
          console.log('Reloading extension...');
          chrome.runtime.reload();
        }
      } catch (err) {
        console.error('Failed to parse reload message:', err);
      }
    }
  };

  connection.onopen = () => {
    console.log('Development reload client connected');
  };
} catch (err) {
  console.log('Development reload not available:', err.message);
}
