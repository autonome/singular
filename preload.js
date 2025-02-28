const { ipcRenderer } = require('electron');

const init = () => {

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

  const btn = document.querySelector('.generate');
  const form = document.querySelector('form');

  const toggleSpinner = () => {
    document.querySelectorAll('.lds-grid > div')
      .forEach(d => d.classList.toggle('animating'));
  };

  const onSubmit = () => {
    log('Here we go...');
    toggleSpinner();
    btn.disabled = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      log('The name or URL is bad, ok.');
      toggleSpinner();
    }
    else {
      log('Inputs are valid, generating app...');

      const url = document.querySelector('.url');
      const name = document.querySelector('.name');

      ipcRenderer.send('generate', {
        name: name.value,
        url: url.value
      });
    }
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    onSubmit();
  });

  ipcRenderer.on('victory', (e, msg) => {
    btn.disabled = false;
    toggleSpinner();
    log(msg);
  });

  ipcRenderer.on('fail', (e, msg) => {
    btn.disabled = false;
    toggleSpinner();
    log(msg);
  });

  // Whatever
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type]);
  }

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
};

window.addEventListener('DOMContentLoaded', init);
