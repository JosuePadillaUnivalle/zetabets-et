const url = 'https://api.telegram.org/bot8386480773:AAGjmVBwInEFuCTV4-9Msbw-u0zVD6i3F0U/getMe';
fetch(url).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error('fail', e));
