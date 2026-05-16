FROM php:8.2-fpm-alpine

RUN apk add --no-cache postgresql-dev nginx && docker-php-ext-install pdo_pgsql

COPY . /var/www/html/
COPY nginx.conf /etc/nginx/http.d/default.conf

ENV DB_HOST=db.lvveteqoidlcnmvuoupa.supabase.co
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASS=@Faris111029H
ENV DB_NAME=postgres
ENV APP_URL=https://node407.railway.app

EXPOSE 80

CMD sed -i "s/listen 80/listen ${PORT:-80}/g" /etc/nginx/http.d/default.conf && \
    php-fpm -D && \
    nginx -g "daemon off;"
