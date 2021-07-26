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
        throw new Error(err)
    }

}

export const generateRandomColor = () => {
    const colors = ['yellow', 'purple', 'maroon', 'aqua', 'fucshia', 'salmon']
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    return randomColor
}

// time: seconds
export const getTimerFromSeconds = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time - minutes * 60);

    const padded = (number) => {
        return number.toString().length === 1 ? `0${number}` : number;
    }

    return `${padded(minutes)}:${padded(seconds)}`
}