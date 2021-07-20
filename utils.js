export const postApi = (endpoint, body = {}) => {
    return fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
          },
    })
}

export const generateRandomColor = () => {
    const randomColor = Math.floor(Math.random()*16777215).toString(16);
    return '#' + randomColor
}