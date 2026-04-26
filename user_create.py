from dotenv import dotenv_values
config = dotenv_values(".env")
key  = config.get("API_KEY")

with open("user_script.sh", "w") as file:
    for i in range(100, 700):
        if i >599 or i < 500:
            stringy = '"{\\"Name\\":\\"' + str(i) + '\\",\\"Password\\":\\"\\"}"'
            file.write(f'curl -X POST "http://10.120.7.243:8096/Users/New" -H "accept: */*" -H "Content-Type: application/json" -H "X-Emby-Token: {key}"  -d {stringy}')
            file.write("\n")