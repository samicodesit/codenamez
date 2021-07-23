export const postApi = (endpoint, body) => {
    const options = {
        method: 'POST',
    }

    if (body) {
        options.body = JSON.stringify(body);
        options.headers = {
            'Content-Type': 'application/json'
        }
    }

    try {
        return fetch(endpoint, options)
    } catch(err) {
        console.error(err);
    }

}

export const generateRandomColor = () => {
    const randomColor = Math.floor(Math.random()*16777215).toString(16);
    return '#' + randomColor
}