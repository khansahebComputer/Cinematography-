document.getElementById('clip').addEventListener('click', async () => {
  const idea = document.getElementById('idea').value;
  if (!idea) return;

  // In a real extension, we'd send this to the app via messaging or an API
  alert('Idea clipped to Cinamato AI Studio!');
  window.close();
});
