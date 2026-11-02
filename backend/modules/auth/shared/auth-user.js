function createSafeUser(user, includePhone = true) {
    const safeUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
    };

    if (includePhone) {
        safeUser.phone = user.phone;
    }

    return safeUser;
}

module.exports = {
    createSafeUser,
};