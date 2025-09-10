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

  const onOpen = () => {
    log('Opening the URL...');
    const url = document.querySelector('.url');
    ipcRenderer.send('open', {
      url: url.value
    });
  };

  const onEphemeral = () => {
    log('Opening the URL in ephemeral app...');
    toggleSpinner();
    const url = document.querySelector('.url');
    ipcRenderer.send('ephemeral', {
      url: url.value
    });
    setTimeout(toggleSpinner, 5000);
  };

  const onGenerate = () => {
    log('Here we go...');
    btn.disabled = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      log('The name or URL is bad, ok.');
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
    timedSpinner(5000);
    // Did they click the open button or the generate button?
    const clickedButton = e.submitter;
    if (clickedButton.classList.contains('open')) {
      log('Opening the app...');
      onOpen();
    }
    else if (clickedButton.classList.contains('ephemeral')) {
      log('Opening the app...');
      onEphemeral();
    }
    else if (clickedButton.classList.contains('generate')) {
      log('Generating the app...');
      onGenerate();
    }
  });

  ipcRenderer.on('victory', (e, msg) => {
    btn.disabled = false;
    log('onPackageVictory', msg);
  });

  ipcRenderer.on('fail', (e, msg) => {
    btn.disabled = false;
    log('onPackageFail', msg);
  });

  const timedSpinner = (ms = 400) => {
    const animating =
      document.querySelector('.lds-grid > div').classList.contains('animating');
    if (!animating) {
      toggleSpinner()
      setTimeout(toggleSpinner, ms);
    }
  }

  document.querySelectorAll('input').forEach(el => {
    el.addEventListener('keyup', () => {
      timedSpinner(400);
    });
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
