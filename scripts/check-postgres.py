import os, subprocess, secrets, pathlib, tempfile, time, json
root=pathlib.Path(__file__).resolve().parents[1]
env=os.environ.copy(); env['POSTGRES_PASSWORD']=secrets.token_urlsafe(24)
name='storm-pg-release-'+str(os.getpid())
base=['docker','--host=unix:///var/run/docker.sock']
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']: env.pop(key,None)
def run(args, **kwargs):
    return subprocess.run(args, cwd=root, env=env, check=True, text=True, **kwargs)
try:
    run(base+['run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD','-e','POSTGRES_USER=storm','-e','POSTGRES_DB=storm','-p','127.0.0.1::5432','postgres:17-alpine'],stdout=subprocess.PIPE)
    for attempt in range(30):
        ready=subprocess.run(base+['exec',name,'pg_isready','-U','storm'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if ready.returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('PostgreSQL startup timed out')
    port=run(base+['port',name,'5432/tcp'],stdout=subprocess.PIPE).stdout.strip().split(':')[-1]
    env['DATABASE_URL']='postgresql://storm:'+env['POSTGRES_PASSWORD']+'@127.0.0.1:'+port+'/storm?schema=public'
    # Never print the connection URL or the generated temporary password.
    result=run(['node','node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/postgresql/schema.prisma'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    with tempfile.TemporaryDirectory(prefix='storm-pg-client-') as temp:
        folder=pathlib.Path(temp)
        schema=(root/'prisma/postgresql/schema.prisma').read_text().replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = '+json.dumps(str(folder/'client')))
        schema_file=root/'prisma/postgresql/schema.verify.prisma';schema_file.write_text(schema)
        try: run(['node','node_modules/prisma/build/index.js','generate','--schema',str(schema_file)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        finally: schema_file.unlink(missing_ok=True)
        test=folder/'verify.cjs'
        test.write_text('''const { PrismaClient } = require('./client');
const db = new PrismaClient();
(async()=> {
 const customer=await db.customer.create({data:{mode:'demo',name:'PostgreSQL Test',phone:'+490000000001',email:'pg@example.invalid'}});
 const employee=await db.employee.create({data:{mode:'demo',name:'Techniker',role:'EMERGENCY_TECH',upn:'tech@example.invalid',postalCodes:['61184'],pestTypes:['RODENTS']}});
 const ticket=await db.callTicket.create({data:{mode:'demo',provider:'retell',externalId:'pg-call',customerId:customer.id,assignedEmployeeId:employee.id,durationSeconds:42,callStatus:'ENDED'}});
 await db.$transaction(async tx=>{await tx.employee.update({where:{id:employee.id},data:{availability:'AVAILABLE'}});await tx.outlookArtifact.create({data:{ticketId:ticket.id,employeeId:employee.id,kind:'EVENT',subject:'PG Termin',recipient:employee.upn,bodyText:'PG Notizen',isMock:true,state:'SIMULATED',start:new Date(),end:new Date(Date.now()+1800000)}});});
 const call=await db.telephonyCall.create({data:{carrierCallId:'CA-pg',ticketId:ticket.id,fromNumber:customer.phone,toNumber:'+490000000002'}});
 await db.voiceLeg.create({data:{telephonyId:call.id,provider:'retell',providerCallId:'pg-leg',transcript:'PG Transkript',transcriptRank:2}});
 await db.callActivity.create({data:{ticketId:ticket.id,kind:'PG_CHECK',message:'Datenbankprüfung'}});
 const result=await db.callTicket.findUniqueOrThrow({where:{id:ticket.id},include:{customer:true,assignedEmployee:true,artifacts:true,telephony:{include:{legs:true}},activities:true}});
 if(result.durationSeconds!==42||result.artifacts.length!==1||result.telephony.legs[0].transcript!=='PG Transkript'||result.assignedEmployee.postalCodes[0]!=='61184')throw new Error('PostgreSQL relation/JSON verification failed');
 console.log('PostgreSQL 17: migrations, relations, JSON fields, transaction, Outlook artifact and voice-leg storage passed.');
})().finally(()=>db.$disconnect()).catch(()=>{console.error('PostgreSQL verification failed');process.exitCode=1;});''')
        env['NODE_PATH']=str(root/'node_modules')
        run(['node',str(test)])
finally:
    subprocess.run(base+['rm','-f',name],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
