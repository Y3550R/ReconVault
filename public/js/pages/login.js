import {
    login,
    getCurrentUser,
    redirectAfterLogin
}
    from '../auth.js';
const form = document.getElementById('login-form'),
    alertBox = document.getElementById('login-alert'),
    button = document.getElementById('login-submit'),
    label = button.querySelector('.button-label'),
    spinner = button.querySelector('.button-spinner');
function showError(message) {
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
}
async function existingSession() {
    try {
        await getCurrentUser({
            force: true
        });
        redirectAfterLogin();
    } catch { /* No active session; remain on login. */
    }
}
form.addEventListener(
    'submit',
    async e => {
        e.preventDefault();
        alertBox.classList.add('d-none');
        form.classList.add('was-validated');
        if (!form.checkValidity()) return;
        button.disabled = true;
        spinner.classList.remove('d-none');
        label.textContent = 'Signing in…';
        try {
            await login(
                form.elements.username.value.trim(),
                form.elements.password.value
            );
            await getCurrentUser({
                force: true
            });
            redirectAfterLogin();
        } catch (error) {
            const message =
                typeof error === 'string'
                    ? error
                    : typeof error?.message === 'string'
                        ? error.message
                        : typeof error?.error === 'string'
                            ? error.error
                            : 'Invalid username or password. Please try again.';

            showError(message);
        } finally {
            button.disabled = false;
            spinner.classList.add('d-none');
            label.textContent = 'Sign in';
        }
    }
);
existingSession();
