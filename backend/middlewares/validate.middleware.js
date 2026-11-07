function validate(schema, source = "body") {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: "VALIDATION_ERROR",
                details: result.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            });
        }

        if (source === "query") {
            res.locals.validatedQuery = result.data;
        } else {
            req[source] = result.data;
        }

        next();
    };
}

module.exports = validate;