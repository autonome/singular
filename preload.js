const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  const log = str => {
    console.log('log', str);
    const details = document.querySelector('details');
    const summary = document.querySelector('.status');
    const entry = document.createElement('p');
    entry.innerText = summary.innerText;
    details.appendChild(entry);
    summary.innerText = str;
  };

  ipcRenderer.on('log', (e, msg) => {
    log(msg);
  });

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }

  const name = document.querySelector('.name');
  const url = document.querySelector('.url');
  const spinner = document.querySelector('.lds-grid');
  const form = document.querySelector('form');

  form.addEventListener('submit', e => {
    log('Here we go...');
    document.querySelectorAll('.lds-grid > div').forEach(d => d.classList.toggle('animating'));

    if (!form.checkValidity()) {
      form.reportValidity();
      log('The name or URL is bad, ok.');
    }
    else {
      log('Inputs are fine, generating...');

      ipcRenderer.send('generate', {
        name: name.value,
        url: url.value
      });

      ipcRenderer.on('degenerate', (e, msg) => {
        if (msg.res == 'victory' || msg.res == 'fail') {
          document.querySelectorAll('.lds-grid > div').forEach(d => d.classList.toggle('animating'));
        }
      });
    }

    e.preventDefault();
  });

  /*
  // Test
  setTimeout(() => {
    ipcRenderer.send('generate', {
      name: 'test',
      url: 'http://localhost'
    });
    log('Sent');
  }, 1000);
  */
})
